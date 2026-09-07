<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi con cui si approva una proposta.
 *
 * SONO TUTTI OPZIONALI, e non e' lassismo: approvare senza correggere niente
 * e' il caso normale, e obbligare a rimandare indietro l'intera voce
 * significherebbe che una richiesta a cui manca un campo la svuota. Cio' che
 * non arriva resta com'e'.
 *
 * Le rule sono l'unione di quelle degli esercizi e di quelle degli alimenti:
 * il controller applica solo le chiavi pertinenti al tipo, e una chiave di
 * troppo non fa danno perche' `fill()` guarda comunque il fillable del model
 * giusto.
 */
class ReviewSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Il middleware `admin` sul gruppo di rotte ha gia' deciso.
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            // Esercizi
            'muscleGroup' => ['sometimes', 'string', 'max:40'],
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:200'],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:120'],
            'instructions' => ['sometimes', 'nullable', 'string', 'max:2000'],
            // Alimenti
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'kcal' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'protein' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'carbs' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'sugars' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'fat' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'saturatedFat' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'fiber' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'salt' => ['sometimes', 'numeric', 'min:0', 'max:9999'],
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
            // Rifiuto
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
