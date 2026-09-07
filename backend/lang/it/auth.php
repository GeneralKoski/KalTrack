<?php

/*
 * Le tre chiavi che Laravel stesso definisce in auth.php, e non una di piu':
 * senza questo file `__('auth.failed')` cadeva sul default inglese del
 * framework (vendor/laravel/framework/.../lang/en/auth.php), perche' non
 * esisteva una versione italiana - non un caso limite, la lingua di serie di
 * KalTrack.
 *
 * 'failed' e' la stessa frase gia' in uso in AuthController prima di questo
 * file: chi legge "Credenziali non corrette." in italiano non vede nessun
 * cambiamento, e chi lo leggeva in inglese ora vede l'inglese vero.
 */
return [
    'failed' => 'Credenziali non corrette.',
    'password' => 'La password non è corretta.',
    'throttle' => 'Troppi tentativi di accesso. Riprova tra :seconds secondi.',
];
