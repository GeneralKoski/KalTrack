<?php

namespace App\Support;

/**
 * Un nome di file accettabile per finire dentro un percorso su disco.
 *
 * Senza questo controllo un `../` farebbe leggere o scrivere fuori dalla
 * cartella prevista. Il primo carattere non puo' essere un punto: esclude
 * `.` e `..` insieme, e tiene fuori anche i file nascosti.
 *
 * Un solo posto per la regola: la condividono `ImageController` (le foto per
 * utente) e `CatalogController` (le foto di catalogo). Una regola che guarda
 * una traversata di percorso e vive in due copie e' una regola che si
 * corregge in una sola per dimenticanza, lasciando l'altro endpoint
 * silenziosamente riaperto.
 */
class FileName
{
    private const PATTERN = '/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$/';

    public static function isAcceptable(string $name): bool
    {
        return preg_match(self::PATTERN, $name) === 1;
    }

    /** La stessa regola, nella forma che `validate()` si aspetta per `regex:`. */
    public static function rule(): string
    {
        return 'regex:'.self::PATTERN;
    }
}
