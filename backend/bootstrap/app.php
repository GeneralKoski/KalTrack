<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * Nessun redirect per chi non e' autenticato.
         *
         * Il default di Laravel manda gli ospiti a route('login'), che qui non
         * esiste: e' un'API pura, senza pagine. Il risultato era un 500
         * "Route [login] not defined" al posto del 401, per ogni richiesta
         * senza token che non chiedesse esplicitamente JSON. Tornando null il
         * middleware lancia AuthenticationException, che l'handler rende come
         * 401 JSON.
         */
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
