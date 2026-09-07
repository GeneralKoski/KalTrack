<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi di un esercizio di catalogo, scritti dal gestionale.
 *
 * `required` in creazione, `sometimes` in correzione: da web si corregge un
 * campo alla volta, e obbligare a rimandare l'intera voce a ogni ritocco
 * significherebbe che una richiesta a cui manca un campo lo svuota.
 *
 * `uid` non c'e', ed e' voluto: l'identita' non si scrive a mano. Nasce con
 * la voce e non cambia piu', o una rinomina arriverebbe sul telefono come una
 * voce nuova invece che come una rinomina.
 */
class AdminExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        $obbligatorio = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$obbligatorio, 'string', 'max:120'],
            'muscleGroup' => [$obbligatorio, 'string', 'max:40'],
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:200'],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:120'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
