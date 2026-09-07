<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Rimettere a posto la password di qualcuno, dall'app o dal gestionale.
 *
 * Serve perche' non c'e' il recupero password via email: senza questo,
 * chi dimentica la propria e' fuori, e l'unico rimedio era un comando sul
 * server. Con pochi utenti che si conoscono, e' il rimedio proporzionato.
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
