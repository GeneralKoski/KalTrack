<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ComparisonController;
use App\Http\Controllers\Api\ExerciseController;
use App\Http\Controllers\Api\FoodController;
use App\Http\Controllers\Api\FriendshipController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\SharedStatController;
use App\Http\Controllers\Api\SharedWorkoutController;
use App\Http\Controllers\Api\AdminController;
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
    /*
     * L'unico endpoint che pubblica contenuto e non totali. Rifiuta se
     * l'interruttore della palestra e' spento: la prima difesa e' sul
     * telefono, che a interruttore spento non manda niente, ma una difesa sola
     * su questo dato non basta.
     */
    Route::put('me/workouts', [SharedWorkoutController::class, 'sync']);

    // La copia del database del telefono: push e pull in una sola andata.
    Route::post('sync', [SyncController::class, 'sync']);

    /*
     * I byte delle foto: la sincronizzazione porta le righe, questi portano i
     * file a cui le righe puntano. Senza, una ricetta con foto arriva
     * sull'altro telefono con un rettangolo vuoto al posto dell'immagine.
     */
    /*
     * Amministrazione: solo per chi ha `is_admin`. Il controllo e' dentro il
     * controller e non qui, cosi' vive accanto a cio' che protegge.
     */
    Route::get('admin/users', [AdminController::class, 'users']);
    /*
     * Limitato per tentativi come `login` e `register`.
     *
     * Il controllo su `is_admin` sta nel controller e basta a fermare chi non
     * lo e', ma questo endpoint assegna password: un limite lo rende anche
     * inutile da usare a raffica, e un amministratore legittimo non ne cambia
     * dieci al minuto.
     */
    Route::post('admin/users/{user}/password', [AdminController::class, 'resetPassword'])
        ->middleware('throttle:10,1');

    Route::get('images', [ImageController::class, 'index']);
    Route::post('images', [ImageController::class, 'store']);
    Route::get('images/{name}', [ImageController::class, 'show']);
    Route::delete('images/{name}', [ImageController::class, 'destroy']);

    /*
     * Il catalogo degli esercizi: l'unica cosa di questo server che e' comune
     * a tutti gli iscritti invece che filtrata per amicizia. Un esercizio
     * creato a mano da qualcuno entra nell'elenco di chiunque, e il catalogo
     * non dice chi lo ha aggiunto.
     */
    Route::get('exercises', [ExerciseController::class, 'index']);
    Route::post('exercises', [ExerciseController::class, 'store'])
        ->middleware('throttle:30,1');
    /*
     * Correggere e togliere: SOLO le voci che si sono aggiunte. Senza queste
     * due, una voce scritta male restava nell'app di tutti per sempre.
     */
    Route::patch('exercises/{exercise}', [ExerciseController::class, 'update']);
    Route::delete('exercises/{exercise}', [ExerciseController::class, 'destroy']);

    /*
     * Il catalogo degli alimenti: stesse regole di quello degli esercizi.
     * Serve anche alle ricette, che sono fatte di alimenti e senza un elenco
     * comune sull'altro telefono sarebbero riferimenti a niente.
     */
    Route::get('foods', [FoodController::class, 'index']);
    Route::post('foods', [FoodController::class, 'store'])
        ->middleware('throttle:60,1');
    Route::patch('foods/{food}', [FoodController::class, 'update']);
    Route::delete('foods/{food}', [FoodController::class, 'destroy']);

    Route::get('users', [ProfileController::class, 'search']);
    Route::get('users/{handle}', [ProfileController::class, 'show']);

    /*
     * Il confronto con piu' persone: un endpoint solo, ma le due regole della
     * privacy si applicano per ciascuno. Un non amico esce senza numeri invece
     * di far fallire la richiesta degli altri.
     */
    Route::get('comparison', [ComparisonController::class, 'index']);

    Route::get('friendships', [FriendshipController::class, 'index']);
    Route::post('friendships', [FriendshipController::class, 'store']);
    Route::patch('friendships/{friendship}/accept', [FriendshipController::class, 'accept']);
    Route::delete('friendships/{friendship}', [FriendshipController::class, 'destroy']);
});
