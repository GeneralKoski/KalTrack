<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Una sincronizzazione: quel che il telefono ha cambiato, e da dove riprendere.
 *
 * `since` e' il segnaposto restituito dalla sincronizzazione precedente. Vuoto
 * la prima volta, e allora il server manda tutto quello che ha.
 */
class SyncRequest extends FormRequest
{
    /** Quante righe al massimo in una sola andata. Oltre, si spezza in piu' giri. */
    public const MAX_CHANGES = 2000;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            /*
             * Un numero, non una data: il segnaposto e' il contatore
             * `sequence`. Restava una data quando dipendeva da `synced_at`, e
             * con quello due dispositivi che sincronizzavano nello stesso
             * secondo si perdevano le righe a vicenda.
             */
            'since' => ['nullable', 'integer', 'min:0'],
            'changes' => ['present', 'array', 'max:'.self::MAX_CHANGES],
            'changes.*.table' => ['required', 'string', 'max:40'],
            /*
             * Una stringa, non un uuid.
             *
             * Il client genera i propri id e la maggior parte sono UUID, ma
             * non tutti: i tipi di pasto hanno id parlanti come "mt-lunch" e
             * le impostazioni usano la loro chiave. Imporre il formato qui
             * faceva rifiutare l'intera sincronizzazione per quelle righe, e
             * comunque non e' il server a decidere come il telefono nomina le
             * proprie.
             */
            'changes.*.id' => ['required', 'string', 'max:64'],
            'changes.*.payload' => ['required', 'array'],
            'changes.*.updatedAt' => ['required', 'date'],
            'changes.*.deletedAt' => ['nullable', 'date'],
            'changes.*.createdAt' => ['required', 'date'],
        ];
    }
}
