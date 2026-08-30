<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\FriendshipController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\SharedStatController;
use App\Http\Controllers\Api\ImageController;
use App\Http\Controllers\Api\SyncController;
use Illuminate\Support\Facades\Route;

/*
 * L'API degli amici.
 *
 * Tutto sotto `auth:sanctum` tranne registrazione e login: non esiste nessuna
 * lettura pubblica, nemmeno di un profilo. Chi non ha un account non vede
 * niente di nessuno.
 *
 * La registrazione e il login sono limitati per tentativi: sono gli unici due
 * endpoint che chiunque puo' chiamare.
 */
Route::post('register', [AuthController::class, 'register'])
    ->middleware('throttle:6,1');
Route::post('login', [AuthController::class, 'login'])
    ->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);

    Route::get('me', [ProfileController::class, 'me']);
    Route::patch('me', [ProfileController::class, 'update']);
    Route::put('me/stats', [SharedStatController::class, 'sync']);

    // La copia del database del telefono: push e pull in una sola andata.
    Route::post('sync', [SyncController::class, 'sync']);

    /*
     * I byte delle foto: la sincronizzazione porta le righe, questi portano i
     * file a cui le righe puntano. Senza, una ricetta con foto arriva
     * sull'altro telefono con un rettangolo vuoto al posto dell'immagine.
     */
    Route::get('images', [ImageController::class, 'index']);
    Route::post('images', [ImageController::class, 'store']);
    Route::get('images/{name}', [ImageController::class, 'show']);
    Route::delete('images/{name}', [ImageController::class, 'destroy']);

    Route::get('users', [ProfileController::class, 'search']);
    Route::get('users/{handle}', [ProfileController::class, 'show']);

    Route::get('friendships', [FriendshipController::class, 'index']);
    Route::post('friendships', [FriendshipController::class, 'store']);
    Route::patch('friendships/{friendship}/accept', [FriendshipController::class, 'accept']);
    Route::delete('friendships/{friendship}', [FriendshipController::class, 'destroy']);
});
