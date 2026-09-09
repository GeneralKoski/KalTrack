<?php

use App\Http\Controllers\AdminAuthController;
use App\Http\Middleware\SetLocaleFromHeader;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/*
 * Dove atterra il collegamento della mail di recupero.
 *
 * Il nome `password.reset` non e' decorativo: la notifica di serie di Laravel
 * (`Illuminate\Auth\Notifications\ResetPassword`) costruisce la URL da questa
 * rotta per nome, quindi senza di lei `sendResetLink` va in errore mentre
 * compone la mail. Il token e' un segmento, l'email una stringa di query: e'
 * la forma che quella notifica usa, e cambiarla vorrebbe dire riscrivere anche
 * lei.
 *
 * Sta in `web.php` perche' e' una pagina che si apre in un browser, ma non ha
 * bisogno di sessione: il token nella URL e' l'unica credenziale in gioco, e
 * il modulo chiama poi `POST /api/password/reset`.
 */
Route::get('password/reset/{token}', function (Request $request, string $token) {
    return view('auth.reset-password', [
        'token' => $token,
        'email' => (string) $request->query('email', ''),
    ]);
})->name('password.reset');

/*
 * Il gestionale.
 *
 * Sta in `web.php` e non in `api.php` perche' ha bisogno della sessione e del
 * token CSRF, che il gruppo `api` non monta. La SPA chiama poi `/api/admin/*`
 * con lo stesso cookie: Sanctum accetta la sessione per le richieste che
 * arrivano da un dominio dichiarato stateful.
 */
Route::post('admin/login', [AdminAuthController::class, 'login'])
    ->middleware([
        // Come `login` e `register` dell'app: e' l'unica porta che chiunque
        // puo' bussare, e va limitata per tentativi.
        'throttle:6,1',
        // `SetLocaleFromHeader` e' appesa al gruppo `api` in bootstrap/app.php,
        // ma questa rotta e' nel gruppo `web` e non la eredita: senza,
        // "Credenziali non corrette" risponderebbe sempre nella lingua di
        // default del server, a prescindere da `Accept-Language`.
        SetLocaleFromHeader::class,
    ]);
Route::post('admin/logout', [AdminAuthController::class, 'logout']);

/*
 * Il catch-all va per ULTIMO, o mangerebbe le due rotte qui sopra: React
 * Router disegna le sue pagine dal percorso, e il server deve rendere la
 * stessa pagina per ognuno.
 */
Route::get('admin/{any?}', [AdminAuthController::class, 'spa'])
    ->where('any', '.*');
