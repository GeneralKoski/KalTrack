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

    /**
     * Sfugge i metacaratteri di LIKE (`%`, `_`, e il carattere di fuga stesso)
     * cosi' un valore letterale non si comporta come un pattern.
     *
     * `_` e' un jolly di LIKE che vale "un carattere qualunque": uno slug come
     * "corpo_libero" passato senza fuga combacerebbe anche con un ipotetico
     * "corpoXlibero". Va sempre abbinato in query a una clausola
     * `ESCAPE '\'`, o la fuga non viene interpretata e resta nel valore.
     */
    public static function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }
}
