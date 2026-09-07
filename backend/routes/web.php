<?php

use App\Http\Controllers\AdminAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/*
 * Il gestionale.
 *
 * Sta in `web.php` e non in `api.php` perche' ha bisogno della sessione e del
 * token CSRF, che il gruppo `api` non monta. La SPA chiama poi `/api/admin/*`
 * con lo stesso cookie: Sanctum accetta la sessione per le richieste che
 * arrivano da un dominio dichiarato stateful.
 */
Route::post('admin/login', [AdminAuthController::class, 'login'])
    // Come `login` e `register` dell'app: e' l'unica porta che chiunque puo'
    // bussare, e va limitata per tentativi.
    ->middleware('throttle:6,1');
Route::post('admin/logout', [AdminAuthController::class, 'logout']);

/*
 * Il catch-all va per ULTIMO, o mangerebbe le due rotte qui sopra: React
 * Router disegna le sue pagine dal percorso, e il server deve rendere la
 * stessa pagina per ognuno.
 */
Route::get('admin/{any?}', [AdminAuthController::class, 'spa'])
    ->where('any', '.*');
