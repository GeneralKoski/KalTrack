<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * L'accesso al gestionale.
 *
 * `login` e' l'email o il nome utente, come in `LoginRequest`: chi entra non
 * deve ricordarsi quale dei due questo modulo si aspetta.
 */
class AdminLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ];
    }
}
