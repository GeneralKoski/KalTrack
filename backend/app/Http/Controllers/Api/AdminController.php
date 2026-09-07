<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
    /** L'elenco, per scegliere a chi cambiarla. */
    public function users(Request $request): JsonResponse
    {
        return response()->json([
            'users' => User::query()
                ->orderBy('handle')
                ->get()
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'handle' => $u->handle,
                    'displayName' => $u->display_name ?? $u->name,
                    'email' => $u->email,
                    'isAdmin' => $u->is_admin,
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
}
