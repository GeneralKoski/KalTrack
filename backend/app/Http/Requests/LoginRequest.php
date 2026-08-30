<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Si entra con l'email OPPURE con il nome utente.
     *
     * Il campo si chiama `login` e non `email` proprio perche' puo' essere
     * l'una o l'altro: chiamarlo `email` e poi accettarci dentro un handle
     * avrebbe fatto comparire "Email o password non corretti" a chi ha scritto
     * correttamente il proprio nome utente.
     *
     * Nessuna regola `email` sul campo: un handle non e' un indirizzo, e
     * validarlo come tale rifiuterebbe proprio il caso che stiamo aggiungendo.
     */
    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
        ];
    }
}
