<?php

namespace App\Support;

/**
 * La stessa normalizzazione di `src/domain/text.ts`, lato server.
 *
 * E' scritta due volte, ed e' una duplicazione voluta: il telefono normalizza
 * per cercare nel proprio SQLite, il server per non riempire il catalogo di
 * tutti di doppioni, e nessuno dei due puo' chiedere all'altro di farlo. Le
 * due implementazioni devono pero' dare lo stesso risultato, altrimenti
 * "Panca Piana" e' un doppione qui e no di la': i test di `TextTest` sono gli
 * stessi casi di `src/domain/text.test.ts`, apposta.
 */
class Text
{
    public static function normalize(string $value): string
    {
        $value = mb_strtolower($value);

        // Toglie gli accenti passando per la forma decomposta, come fa il
        // `normalize("NFD")` del telefono.
        $value = \Normalizer::normalize($value, \Normalizer::FORM_D) ?: $value;
        $value = preg_replace('/\p{Mn}/u', '', $value);

        $value = preg_replace('/[^a-z0-9\s]/', ' ', $value);
        $value = preg_replace('/\s+/', ' ', $value);

        return trim($value);
    }
}
