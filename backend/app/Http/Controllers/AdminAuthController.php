<?php

namespace App\Http\Controllers;

use App\Http\Requests\Admin\AdminLoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Illuminate\View\View;

/**
 * L'accesso al gestionale.
 *
 * SESSIONE E NON TOKEN, ed e' l'unica differenza sostanziale con
 * `AuthController`, che serve l'app. Un token per una SPA va custodito nel
 * browser, e cio' che sta in `localStorage` un XSS se lo porta via; il cookie
 * di sessione e' `httpOnly` e la sessione qui c'e' gia' - `SESSION_DRIVER` e'
 * `database` e la tabella `sessions` esiste dalla prima migrazione.
 *
 * L'app continua a usare `POST /api/login` e i suoi token: sono due client
 * diversi con due esigenze diverse, e non c'e' motivo di forzarli sullo
 * stesso meccanismo.
 */
class AdminAuthController extends Controller
{
    public function login(AdminLoginRequest $request): JsonResponse
    {
        $dati = $request->validated();

        $user = User::whereHandle($dati['login'])->first()
            ?? User::where('email', $dati['login'])->first();

        if ($user === null || ! Hash::check($dati['password'], $user->password)) {
            throw ValidationException::withMessages([
                // Lo stesso messaggio per utente inesistente e password
                // sbagliata: distinguerli direbbe a chi prova quali indirizzi
                // esistono.
                'login' => [__('auth.failed')],
            ]);
        }

        /*
         * Il controllo su `is_admin` sta QUI, all'accesso.
         *
         * Il middleware `admin` fermerebbe comunque ogni sua richiesta, ma
         * farlo entrare e poi mostrargli pagine vuote sembrerebbe un'app
         * rotta - e lascerebbe una sessione aperta a chi non deve averne una.
         */
        if (! $user->is_admin) {
            throw ValidationException::withMessages([
                'login' => [__('auth.failed')],
            ]);
        }

        Auth::login($user, remember: true);
        $request->session()->regenerate();

        return response()->json([
            'handle' => $user->handle,
            'displayName' => $user->display_name ?? $user->name,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /** La SPA. Ogni percorso sotto `/admin` rende la stessa pagina. */
    public function spa(): View
    {
        return view('admin');
    }
}
