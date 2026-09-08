<?php

namespace App\Http\Requests\Admin;

use App\Models\Food;
use Illuminate\Foundation\Http\FormRequest;

/**
 * I campi di un alimento di catalogo, scritti dal gestionale.
 *
 * I valori sono PER 100 g o 100 ml, come nella tabella del telefono: la
 * migrazione lo dichiara, e cambiare unita' fra i due lati vorrebbe dire un
 * fattore di conversione da ricordare a ogni lettura - il genere di dettaglio
 * che si dimentica una volta e sballa un diario intero.
 *
 * I due tetti (`Food::MAX_KCAL`, `Food::MAX_NUTRIENT_GRAMS`) stavano qui
 * ripetuti a 9999, un numero piu' permissivo di quello che l'app impone gia'
 * a chi propone una voce da telefono (`FoodController::rules()`): un
 * amministratore poteva scrivere `protein: 9999` per 100 g, un valore che
 * nessun alimento vero puo' avere. Ora sono gli stessi dell'app, in un posto
 * solo sul model - un numero fuori scala e' un errore di battitura che e'
 * meglio fermare qui che spiegare dopo, e fermarlo diversamente a seconda
 * della porta da cui entra non protegge nessuno.
 *
 * `kcal` e' l'unico nutriente obbligatorio in creazione, e non per
 * simmetria mancata con gli altri sette: la colonna ha `default 0` nella
 * migrazione, quindi un alimento creato senza kcal non verrebbe salvato come
 * "sconosciuto" ma come zero calorie. Chi lo registra nel diario ci somma
 * zero senza che nulla a schermo lo segnali, e il diario sbaglia in un modo
 * che non si vede. Un alimento con kcal ma senza fibre e' una voce
 * incompleta, ed e' uno stato onesto per un catalogo che cresce a mano; un
 * alimento senza kcal non e' incompleto, e' sbagliato.
 */
class AdminFoodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    /**
     * I sette nutrienti che si possono svuotare. `kcal` non c'e': e'
     * obbligatorio in creazione per la ragione scritta sopra.
     */
    private const SVUOTABILI = [
        'protein',
        'carbs',
        'sugars',
        'fat',
        'saturatedFat',
        'fiber',
        'salt',
    ];

    /**
     * Un nutriente svuotato vale zero, e non e' un ripiego: e' quel che quel
     * campo significa da entrambi i lati.
     *
     * Le otto colonne sono `NOT NULL DEFAULT 0` sul server come sul telefono
     * (`create_foods_table`, `001_initial.ts`), e `FoodController::colonne`
     * scrive `?? 0` da sempre per una proposta che arriva dall'app senza
     * quel valore: in questo dominio "non dichiarato" e' zero, e `null` non
     * e' un valore che si possa scrivere in colonna.
     *
     * Senza questa conversione nessun alimento con un campo nutrizionale
     * vuoto si poteva salvare dal pannello: l'`InputNumber` di antd tiene
     * `null` quando lo si svuota, `JSON.stringify` lo manda, e la regola
     * `numeric` lo rifiutava - aprire un alimento, cancellare uno zucchero
     * sbagliato e premere Salva dava un 422 con il campo in rosso e nessuna
     * via d'uscita.
     *
     * Si converte qui e non si filtra la chiave lato client, ed e' la
     * differenza che conta: filtrare vorrebbe dire lasciare in colonna il
     * valore sbagliato che si stava cancellando, cioe' un Salva che riesce e
     * non fa quel che gli si e' chiesto. Un amministratore deve poter
     * AZZERARE un valore sbagliato - e' la seconda correzione piu' probabile
     * dopo un refuso.
     */
    protected function prepareForValidation(): void
    {
        $azzerati = [];

        foreach (self::SVUOTABILI as $campo) {
            // `has()` e non `filled()`: la chiave c'e' e vale `null`, ed e'
            // esattamente il caso da convertire.
            if ($this->has($campo) && $this->input($campo) === null) {
                $azzerati[$campo] = 0;
            }
        }

        if ($azzerati !== []) {
            $this->merge($azzerati);
        }
    }

    public function rules(): array
    {
        $obbligatorio = $this->isMethod('POST') ? 'required' : 'sometimes';
        // Nessun `nullable`: `prepareForValidation` ha gia' trasformato in
        // zero il campo svuotato, quindi un `null` non arriva mai fin qui - e
        // scriverlo direbbe che la colonna lo accetta, che non e' vero.
        $nutriente = ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS];

        return [
            'name' => [$obbligatorio, 'string', 'max:120'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:32'],
            'offId' => ['sometimes', 'nullable', 'string', 'max:64'],
            'kcal' => [$obbligatorio, 'numeric', 'min:0', 'max:'.Food::MAX_KCAL],
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
