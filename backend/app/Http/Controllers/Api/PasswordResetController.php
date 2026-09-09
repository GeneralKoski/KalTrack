<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

/**
 * Il recupero della password, per chi non ce l'ha piu'.
 *
 * Il gestionale poteva solo ASSEGNARE una password (`AdminController::
 * resetPassword`), cioe' l'amministratore la scriveva e poi doveva
 * comunicarla: la sapevano in due, e passava da un canale qualunque. Qui c'e'
 * l'altra meta', quella che nessuno legge in mezzo - un collegamento a tempo
 * mandato all'indirizzo dell'utente - e l'assegnazione a mano resta per quando
 * la mail non e' raggiungibile.
 *
 * Chi manda la mail e' Laravel (`Password::sendResetLink`), che scrive nella
 * tabella `password_reset_tokens` un token con la sua scadenza
 * (`config('auth.passwords.users.expire')`, sessanta minuti). Con
 * `MAIL_MAILER=log` la mail finisce in `storage/logs`: e' il caso di adesso, e
 * il giorno che si configura un mittente vero non cambia una riga di qui.
 */
class PasswordResetController extends Controller
{
    /**
     * Chiede il collegamento di recupero.
     *
     * **Risponde sempre allo stesso modo**, indirizzo sconosciuto compreso, ed
     * e' deliberato: una risposta diversa per un'email che non esiste
     * trasforma questo endpoint in un modo per sapere chi e' iscritto. E'
     * anche il motivo per cui e' sotto `throttle` - provare mille indirizzi
     * costa poco a chi prova e molto a chi li riceve.
     */
    public function forgot(Request $request): JsonResponse
    {
        $dati = $request->validate([
            'email' => ['required', 'email', 'max:255'],
        ]);

        Password::sendResetLink(['email' => $dati['email']]);

        return response()->json([
            'message' => 'Se quell\'indirizzo ha un account, il collegamento è in arrivo.',
        ]);
    }

    /**
     * Riscrive la password con il token arrivato per mail.
     *
     * `Password::reset` verifica il token e la sua scadenza; quel che sta
     * dentro la callback e' la parte nostra, e le due righe che conta sono le
     * stesse dell'assegnazione dal gestionale: password nuova e **token di
     * accesso tutti cancellati**. Una password si recupera anche perche' si
     * teme che qualcuno la conosca, e lasciare aperte le sessioni gia'
     * avviate renderebbe il recupero una formalita'.
     */
    public function reset(Request $request): JsonResponse
    {
        $dati = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            // Gli stessi limiti della registrazione e dell'assegnazione dal
            // gestionale: una scorciatoia qui accetterebbe una password che
            // in registrazione sarebbe stata rifiutata.
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ]);

        $esito = Password::reset($dati, function (User $utente, string $password) {
            $utente->password = $password;
            $utente->setRememberToken(Str::random(60));
            $utente->save();
            $utente->tokens()->delete();

            event(new PasswordReset($utente));
        });

        if ($esito !== Password::PasswordReset) {
            return response()->json([
                'message' => 'Il collegamento non è più valido: chiedine un altro.',
                'errors' => ['token' => ['Collegamento scaduto o già usato.']],
            ], 422);
        }

        return response()->json(['message' => 'Password aggiornata.']);
    }
}
