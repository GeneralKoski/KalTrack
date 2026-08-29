<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:255', Rule::unique('users')],
            'password' => ['required', 'string', 'min:8', 'max:72'],
            // Minuscole, cifre e underscore: un handle e' un indirizzo, e due
            // handle che differiscono solo per maiuscole sarebbero due persone
            // indistinguibili in una lista.
            'handle' => [
                'required',
                'string',
                'min:3',
                'max:30',
                'regex:/^[a-z0-9_]+$/',
                Rule::unique('users'),
            ],
            'displayName' => ['required', 'string', 'max:60'],
        ];
    }

    public function messages(): array
    {
        return [
            'handle.regex' => 'Il nome utente può contenere solo lettere minuscole, numeri e underscore.',
            'handle.unique' => 'Questo nome utente è già preso.',
        ];
    }
}
