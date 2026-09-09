<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

/**
 * Rimettere a posto la password di qualcuno, dal gestionale.
 *
 * **Due vie, e si scelgono per un motivo.** `sendResetLink` manda il
 * collegamento di recupero all'indirizzo dell'utente, e non fa sapere niente a
 * nessun altro: e' quella da usare. `resetPassword` assegna una password che
 * l'amministratore scrive e poi deve comunicare - la sanno in due e passa da
 * un canale qualunque - e resta perche' e' l'unica che funziona quando la mail
 * non e' raggiungibile: un indirizzo sbagliato alla registrazione, una casella
 * persa.
 *
 * Il recupero via email non c'era affatto fino al 9 settembre 2026, e questo
 * file era l'unico rimedio a una password dimenticata. L'altra meta' - quella
 * che un utente raggiunge da solo, senza chiedere niente a nessuno - sta in
 * `PasswordResetController`.
 *
 * IL CONTROLLO STA SUL SERVER, non nella schermata: l'app nasconde la voce a
 * chi non e' amministratore, ma nascondere non e' proteggere. Vive nel
 * middleware `admin` sul gruppo di rotte, non piu' in questi metodi - vedi
 * `EnsureAdmin`.
 */
class AdminController extends Controller
{
    /** L'elenco, con quel che serve a riconoscere chi propone cosa. */
    public function users(): JsonResponse
    {
        return response()->json([
            'users' => User::query()
                /*
                 * I due conteggi in una query sola per tipo, non uno per
                 * utente: con cento iscritti sarebbero quattrocento query per
                 * disegnare una tabella.
                 *
                 * `withTrashed()` in ogni closure: Exercise/Food hanno
                 * SoftDeletes, quindi la relazione da sola escluderebbe le
                 * righe cancellate. Una proposta cancellata dall'amministratore
                 * e' successa lo stesso - e' il numero con cui si riconosce
                 * chi propone spazzatura, e cancellarla dal conteggio
                 * nasconderebbe proprio quel segnale.
                 */
                ->withCount([
                    'proposedExercises as submitted_exercises' => fn ($q) => $q->withTrashed(),
                    'proposedFoods as submitted_foods' => fn ($q) => $q->withTrashed(),
                    'proposedExercises as published_exercises' => fn ($q) => $q->withTrashed()->where('status', 'published'),
                    'proposedFoods as published_foods' => fn ($q) => $q->withTrashed()->where('status', 'published'),
                ])
                ->orderBy('handle')
                ->get()
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'handle' => $u->handle,
                    'displayName' => $u->display_name ?? $u->name,
                    'email' => $u->email,
                    'isAdmin' => $u->is_admin,
                    'aiEnabled' => $u->ai_enabled,
                    'createdAt' => $u->created_at?->toIso8601String(),
                    'submitted' => $u->submitted_exercises + $u->submitted_foods,
                    'published' => $u->published_exercises + $u->published_foods,
                ]),
        ]);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            // Gli stessi limiti della registrazione: una scorciatoia qui
            // permetterebbe di assegnare a qualcun altro una password che a
            // lui non sarebbe stata accettata.
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ]);

        $user->password = $data['password'];
        $user->save();

        /*
         * I token esistenti cadono.
         *
         * Una password si cambia anche perche' si teme che qualcuno la
         * conosca, e lasciare aperte le sessioni gia' avviate renderebbe il
         * cambio una formalita': chi era dentro resterebbe dentro.
         */
        $user->tokens()->delete();

        return response()->json(['handle' => $user->handle]);
    }

    /**
     * L'altra scelta: manda il collegamento di recupero all'indirizzo
     * dell'utente e non tocca la password.
     *
     * La differenza con `resetPassword` non e' di comodita'. Li' la password
     * la sceglie l'amministratore, quindi la sanno in due e passa da un canale
     * qualunque (un messaggio, una telefonata) per arrivare a destinazione;
     * qui non la sa nessuno tranne chi la scrivera'. Quella resta perche' e'
     * l'unica che funziona quando la mail non e' raggiungibile - un indirizzo
     * sbagliato alla registrazione, una casella persa.
     *
     * Qui l'indirizzo NON arriva dalla richiesta ma dalla riga dell'utente:
     * accettarlo dal pannello vorrebbe dire che un amministratore puo' farsi
     * mandare a un indirizzo suo il collegamento per l'account di un altro.
     *
     * A differenza di `PasswordResetController::forgot`, un esito negativo si
     * dice: chi chiama e' un amministratore che guarda una riga che esiste, e
     * l'enumerazione di indirizzi - la ragione della risposta uniforme
     * dell'endpoint pubblico - non e' un rischio verso chi ha gia' l'elenco
     * degli iscritti sotto gli occhi. Qui la risposta e' l'unico modo di
     * sapere che la mail non e' partita.
     */
    public function sendResetLink(User $user): JsonResponse
    {
        $esito = Password::sendResetLink(['email' => $user->email]);

        if ($esito !== Password::ResetLinkSent) {
            /*
             * Il messaggio e' scritto qui e non tradotto da `$esito`: quello
             * e' una chiave (`passwords.throttled`, `passwords.user`) e le
             * traduzioni di Laravel per quel file non sono pubblicate in
             * questo progetto - `trans()` restituirebbe la chiave nuda, cioe'
             * "La mail non e' partita: passwords.user".
             *
             * I due casi che arrivano qui sono uno di troppa fretta (un
             * collegamento chiesto un attimo fa e' ancora valido) e uno di
             * indirizzo che il broker non riconosce.
             */
            return response()->json([
                'message' => $esito === Password::ResetThrottled
                    ? 'Un collegamento è stato mandato pochi istanti fa: quello vale ancora.'
                    : 'La mail non è partita: questo indirizzo non è utilizzabile per il recupero.',
            ], 422);
        }

        return response()->json(['email' => $user->email]);
    }

    /**
     * L'interruttore dell'AI.
     *
     * E' UN CARTELLO E NON UNA SERRATURA finche' le chiamate a Gemini partono
     * dal telefono con la chiave nel bundle: spegnerlo nasconde il microfono
     * e nient'altro. Serve gia' a regalare l'AI a chi si vuole, e diventa un
     * diritto vero quando le chiamate passeranno da qui - `TODO.md` sez. 3.1.
     */
    public function updateUser(UpdateUserRequest $request, User $user): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('aiEnabled', $dati)) {
            $user->ai_enabled = $dati['aiEnabled'];
            $user->save();
        }

        return response()->json([
            'id' => $user->id,
            'handle' => $user->handle,
            'aiEnabled' => $user->ai_enabled,
        ]);
    }

    /**
     * I numeri della dashboard.
     *
     * I due sotto `missing` non sono decorazione: 128 esercizi su 200 sono
     * rimasti senza descrizione per mesi, e la ragione e' che nessuna
     * schermata contava quanti fossero. Un numero in cima alla dashboard e un
     * filtro che ci porta dentro (`?missing=instructions`) sono le due meta'
     * dello stesso rimedio.
     */
    public function stats(): JsonResponse
    {
        return response()->json([
            'users' => User::count(),
            'pending' => [
                'exercises' => Exercise::where('status', 'pending')->count(),
                'foods' => Food::where('status', 'pending')->count(),
            ],
            'published' => [
                'exercises' => Exercise::where('status', 'published')->count(),
                'foods' => Food::where('status', 'published')->count(),
            ],
            'missing' => [
                'instructions' => Exercise::where('status', 'published')
                    ->where(fn ($q) => $q->whereNull('instructions')->orWhere('instructions', ''))
                    ->count(),
                'photos' => Exercise::where('status', 'published')
                    ->whereNull('photo')
                    ->count(),
            ],
        ]);
    }
}
