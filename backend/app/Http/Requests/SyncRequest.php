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
            'since' => ['nullable', 'date'],
            'changes' => ['present', 'array', 'max:'.self::MAX_CHANGES],
            'changes.*.table' => ['required', 'string', 'max:40'],
            'changes.*.id' => ['required', 'uuid'],
            'changes.*.payload' => ['required', 'array'],
            'changes.*.updatedAt' => ['required', 'date'],
            'changes.*.deletedAt' => ['nullable', 'date'],
            'changes.*.createdAt' => ['required', 'date'],
        ];
    }
}
