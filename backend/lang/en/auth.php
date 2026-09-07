<?php

/*
 * Stessa ragione di lang/it/auth.php: senza un file proprio per queste tre
 * chiavi, il locale inglese risolveva comunque sul default del framework -
 * qui il testo non cambia, ma la chiave ha ora una casa in questo progetto
 * invece di dipendere da un file dentro vendor/.
 */
return [
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',
];
