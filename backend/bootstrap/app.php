<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\SetLocaleFromHeader;
use App\Support\ValidationMessage;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * Ci si fida dell'nginx che sta davanti, e senza questa riga non ci si
         * fidava di nessuno.
         *
         * Il TLS lo chiude l'nginx del server, che poi parla al container in
         * chiaro mandando `X-Forwarded-Proto: https` (e `X-Forwarded-For` con
         * l'IP vero). Quelle intestazioni arrivavano da sempre; quel che
         * mancava era dichiarare che si possono credere - senza,
         * `Request::getTrustedProxies()` e' vuoto e Symfony le ignora tutte.
         * Due conseguenze, e nessuna delle due si vede in un test:
         *
         * - `$request->isSecure()` tornava false, quindi `asset()` - e con lui
         *   `@vite` - scriveva `http://` dentro una pagina servita in
         *   `https://`. Il browser blocca uno script cosi' (mixed content), e
         *   il gestionale restava un `<div id="admin-root">` vuoto: la pagina
         *   risponde 200 e non c'e' niente dentro. Un controllo sul codice di
         *   stato non lo coglie.
         * - il client era sempre il gateway di Docker, cioe' **lo stesso per
         *   tutti**: il `throttle:6,1` su `login` e `register` non contava piu'
         *   i tentativi per chi li fa, li contava per il proxy. E' esattamente
         *   il difetto che il commento nel file nginx dice di aver evitato
         *   mettendo quelle intestazioni - solo che a leggerle non ci pensava
         *   nessuno.
         *
         * `at: '*'` si fida di qualunque mittente, ed **e' sicuro qui per una
         * ragione precisa**: `docker-compose.yml` pubblica la porta su
         * `127.0.0.1:8003`, quindi il container non e' raggiungibile
         * dall'esterno e l'unica via d'ingresso e' quell'nginx. Nessuno da
         * fuori puo' scriversi un `X-Forwarded-For` a piacere. **Chi cambia
         * quel binding in `0.0.0.0` deve cambiare anche questa riga**, o
         * regala a chiunque la possibilita' di dichiararsi un IP diverso a
         * ogni tentativo di accesso.
         */
        $middleware->trustProxies(at: '*');

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

        /*
         * Il cookie di sessione vale anche sulle rotte `/api/*`.
         *
         * Senza, la SPA del gestionale dovrebbe custodire un token nel
         * browser. Con, le sue richieste passano col cookie httpOnly che ha
         * gia'. L'app non ne e' toccata: continua a mandare il suo Bearer, e
         * Sanctum accetta entrambi.
         */
        $middleware->statefulApi();

        $middleware->api(append: [SetLocaleFromHeader::class]);

        $middleware->alias(['admin' => EnsureAdmin::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        /*
         * `errors` resta quello di sempre - i bordi rossi per campo lato app
         * non cambiano. Cambia solo `message`, il riepilogo per il toast:
         * vedi `ValidationMessage::summarize`.
         */
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return response()->json([
                'message' => ValidationMessage::summarize($e->errors()),
                'errors' => $e->errors(),
            ], $e->status);
        });
    })->create();
