<?php

namespace App\Support;

/**
 * Riduce gli errori di validazione di un form a UN messaggio solo, per un
 * toast che non puo' mostrarli tutti - il riepilogo di serie di Laravel
 * ("The X field is required. (and N more errors)") non e' quello.
 *
 * Piu' campi vuoti danno tutti lo stesso testo generico (`validation.required`
 * non usa `:attribute`, ne' in `lang/it/validation.php` ne' nel default
 * inglese di Laravel): in quel caso lo si mostra una volta sola, non "il primo
 * che capita" - dire solo "email obbligatoria" quando anche l'handle e' vuoto
 * lascerebbe credere che basti sistemare l'email.
 *
 * Se invece i messaggi sono diversi fra loro, c'e' almeno un controllo piu'
 * preciso (password non sicura, handle gia' preso...): quello conta di piu'
 * del generico "il campo e' richiesto", e vince lui.
 */
class ValidationMessage
{
    /** @param  array<string, array<string>>  $errors */
    public static function summarize(array $errors): string
    {
        $firstPerField = array_map(fn (array $messages) => $messages[0], $errors);
        $distinct = array_values(array_unique($firstPerField));

        if (count($distinct) <= 1) {
            return $distinct[0] ?? '';
        }

        $generic = trans('validation.required');
        $specific = array_values(array_filter(
            $distinct,
            fn (string $message) => $message !== $generic,
        ));

        return $specific[0] ?? $distinct[0];
    }
}
