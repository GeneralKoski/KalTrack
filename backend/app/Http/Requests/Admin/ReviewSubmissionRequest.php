<?php

namespace App\Http\Requests\Admin;

use App\Models\Food;
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
 * giusto. Proprio perche' copre entrambi i tipi, i due tetti nutrizionali
 * (`Food::MAX_KCAL`, `Food::MAX_NUTRIENT_GRAMS`) restano validi anche per gli
 * esercizi: quelle chiavi semplicemente non esistono su un esercizio, quindi
 * il tetto non li tocca.
 *
 * I due numeri stavano qui ripetuti a 9999, piu' permissivi di quelli che
 * l'app impone gia' a chi propone da telefono (`FoodController::rules()`): un
 * amministratore poteva approvare una proposta scrivendo `protein: 9999` per
 * 100 g. Ora sono gli stessi dell'app, in un posto solo sul model.
 */
class ReviewSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Il middleware `admin` sul gruppo di rotte ha gia' deciso.
        return true;
    }

    /** Gli stessi sette di `AdminFoodRequest::SVUOTABILI`. */
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
     * Un nutriente svuotato vale zero, per la stessa ragione di
     * `AdminFoodRequest::prepareForValidation`, dove il perche' e' scritto
     * per intero: quelle colonne sono `NOT NULL DEFAULT 0` da entrambi i
     * lati, e in questo dominio "non dichiarato" e' zero.
     *
     * Qui morde nel momento peggiore. Una proposta arriva da un telefono,
     * scritta di fretta, e correggerla vuol dire spesso TOGLIERE un valore
     * inventato invece di sostituirlo: senza questa conversione, svuotare quel
     * campo mentre si approva dava un 422 e la proposta restava in coda.
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
        // Nessun `nullable` sui nutrienti: vedi `prepareForValidation` sopra.
        $nutriente = ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS];

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
            'kcal' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_KCAL],
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
            // Rifiuto
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ];
    }
}
