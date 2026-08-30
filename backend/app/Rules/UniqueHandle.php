<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use App\Models\User;

/**
 * Un nome utente libero, senza guardare le maiuscole.
 *
 * `Rule::unique` non basta: su SQLite il confronto e' binario, quindi
 * "GeneralKoski" e "generalkoski" passerebbero entrambi come liberi. Sarebbero
 * due persone indistinguibili in una lista, e - da quando si entra anche con
 * il nome utente - due righe che l'accesso non saprebbe distinguere: il primo
 * dei due si prenderebbe il login dell'altro.
 */
class UniqueHandle implements ValidationRule
{
    public function __construct(private readonly ?int $ignoreUserId = null) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $query = User::whereHandle((string) $value);

        if ($this->ignoreUserId !== null) {
            $query->where('id', '!=', $this->ignoreUserId);
        }

        if ($query->exists()) {
            $fail('Questo nome utente è già preso.');
        }
    }
}
