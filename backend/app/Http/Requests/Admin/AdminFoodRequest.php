<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi di un alimento di catalogo, scritti dal gestionale.
 *
 * I valori sono PER 100 g o 100 ml, come nella tabella del telefono: la
 * migrazione lo dichiara, e cambiare unita' fra i due lati vorrebbe dire un
 * fattore di conversione da ricordare a ogni lettura - il genere di dettaglio
 * che si dimentica una volta e sballa un diario intero.
 *
 * Il tetto a 9999 non e' arbitrario: nessun alimento ha piu' di 900 kcal per
 * cento grammi, e un numero fuori scala e' un errore di battitura che e'
 * meglio fermare qui che spiegare dopo.
 */
class AdminFoodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    public function rules(): array
    {
        $obbligatorio = $this->isMethod('POST') ? 'required' : 'sometimes';
        $nutriente = ['sometimes', 'numeric', 'min:0', 'max:9999'];

        return [
            'name' => [$obbligatorio, 'string', 'max:120'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'offId' => ['sometimes', 'nullable', 'string', 'max:64'],
            'kcal' => $nutriente,
            'protein' => $nutriente,
            'carbs' => $nutriente,
            'sugars' => $nutriente,
            'fat' => $nutriente,
            'saturatedFat' => $nutriente,
            'fiber' => $nutriente,
            'salt' => $nutriente,
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:9999'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
    }
}
