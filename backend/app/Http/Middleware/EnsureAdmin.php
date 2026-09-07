<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Solo per chi ha `is_admin`.
 *
 * Stava dentro `AdminController::ensureAdmin()`, chiamato a mano in ognuno
 * dei suoi due metodi, e li' andava bene: due metodi si controllano a vista.
 * Il gestionale ne porta una ventina, e un controllo ripetuto venti volte e'
 * un controllo che prima o poi si dimentica in uno - senza che niente lo
 * dica, perche' la rotta funzionerebbe benissimo.
 *
 * Il 403 e non un 404: chi non e' amministratore sa gia' che esiste
 * un'amministrazione, l'app gliene nasconde solo la voce di menu. Nascondere
 * l'esistenza della rotta non protegge nessuno e rende illeggibile un errore
 * di configurazione.
 */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user()?->is_admin, 403, 'Non autorizzato.');

        return $next($request);
    }
}
