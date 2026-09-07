<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Cio' che il gestionale puo' cambiare di un utente.
 *
 * UN CAMPO SOLO, e l'elenco corto e' la protezione. Promuovere qualcuno ad
 * amministratore, rinominarlo o sospenderlo non sono cose che questo pannello
 * fa - e finche' non lo sono, non devono poter succedere per sbaglio a causa
 * di un `fill()` generoso su un corpo che arriva dal browser.
 *
 * Il reset password ha la sua rotta, con il suo limite per tentativi.
 */
class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        return ['aiEnabled' => ['sometimes', 'boolean']];
    }
}
