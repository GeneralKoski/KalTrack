<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Una voce del catalogo alimenti, comune a tutti gli iscritti.
 *
 * `created_by` c'e' ma non esce mai da nessuna risposta: serve a decidere chi
 * puo' correggere una voce, non a dire agli altri chi l'ha scritta.
 */
#[Fillable([
    'name',
    'name_norm',
    'brand',
    'kcal',
    'protein',
    'carbs',
    'sugars',
    'fat',
    'saturated_fat',
    'fiber',
    'salt',
    'is_liquid',
    'default_serving_g',
    'serving_label',
    'created_by',
])]
class Food extends Model
{
    /**
     * "food" e' gia' plurale per l'inglese, quindi Eloquent cercherebbe la
     * tabella `food`. La tabella si chiama `foods` come tutte le altre.
     */
    protected $table = 'foods';

    /** I valori nutrizionali, per 100 g / 100 ml. */
    public const NUTRIENTS = [
        'kcal',
        'protein',
        'carbs',
        'sugars',
        'fat',
        'saturated_fat',
        'fiber',
        'salt',
    ];

    protected function casts(): array
    {
        return [
            'kcal' => 'float',
            'protein' => 'float',
            'carbs' => 'float',
            'sugars' => 'float',
            'fat' => 'float',
            'saturated_fat' => 'float',
            'fiber' => 'float',
            'salt' => 'float',
            'is_liquid' => 'boolean',
            'default_serving_g' => 'float',
        ];
    }
}
