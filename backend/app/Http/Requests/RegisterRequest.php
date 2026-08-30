<?php

namespace App\Http\Requests;

use App\Rules\UniqueHandle;
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
            /*
             * Lettere, cifre e underscore. Le maiuscole si possono scrivere e
             * si conservano - uno si chiama come vuole - ma non distinguono:
             * l'unicita' e' insensibile alle maiuscole, o "GeneralKoski" e
             * "generalkoski" sarebbero due persone che nessuna lista sa
             * separare e che l'accesso non saprebbe distinguere.
             */
            'handle' => [
                'required',
                'string',
                'min:3',
                'max:30',
                'regex:/^[A-Za-z0-9_]+$/',
                new UniqueHandle,
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
