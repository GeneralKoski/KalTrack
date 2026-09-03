<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Symfony\Component\HttpFoundation\Response;

/**
 * La lingua dei messaggi (validazione, credenziali non corrette...) segue
 * l'app, non un'impostazione fissa del server: il telefono manda
 * `Accept-Language` con la lingua scelta in `translationStore` (vedi
 * `src/api/client.ts`), qui si sceglie la piu' vicina fra quelle che il
 * server sa tradurre (`lang/it`, l'inglese e' quello di serie di Laravel).
 *
 * Solo per QUESTA richiesta: `App::setLocale` non persiste, e ogni worker
 * PHP-FPM serve richieste di utenti diversi in sequenza - lasciarla scritta
 * farebbe leggere all'utente dopo la lingua di chi era passato prima.
 *
 * L'inglese va PRIMO nell'elenco passato a `getPreferredLanguage`: senza
 * intestazione (client che non la manda, o un test) Symfony non ritorna
 * null - ritorna il primo elemento della lista che gli si passa. Con 'it'
 * per primo il default silenzioso sarebbe stato l'italiano, il contrario
 * di "inglese finche' il dispositivo non dice altro".
 */
class SetLocaleFromHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        App::setLocale($request->getPreferredLanguage(['en', 'it']));

        return $next($request);
    }
}
