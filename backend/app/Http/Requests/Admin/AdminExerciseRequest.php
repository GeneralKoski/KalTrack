<?php

namespace App\Http\Requests\Admin;

use App\Models\Exercise;
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
            // Vedi `Exercise::MAX_SLUG_LIST`: il tetto e' uno per tutte e
            // tre le porte di scrittura, o il pannello approva una proposta
            // che il telefono non poteva mandare - o il contrario.
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:'.Exercise::MAX_SLUG_LIST],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:'.Exercise::MAX_SLUG_LIST],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
