<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Una voce del catalogo alimenti, comune a tutti gli iscritti.
 *
 * `created_by` c'e' ma non esce mai da nessuna risposta: serve a decidere chi
 * puo' correggere una voce, non a dire agli altri chi l'ha scritta.
 */
#[Fillable([
    'uid',
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
    'status',
    'barcode',
    'off_id',
    'image',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'created_by',
])]
class Food extends Model
{
    use SoftDeletes;

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

    /** Gli stessi tre stati degli esercizi: la moderazione e' una sola. */
    public const STATUSES = ['pending', 'published', 'rejected'];

    /**
     * I due tetti dei valori nutrizionali, in un posto solo.
     *
     * C'erano tre copie di questi numeri - `FoodController`, `AdminFoodRequest`
     * e `ReviewSubmissionRequest` - e due valori diversi: l'app rifiutava
     * oltre 1000 kcal e 100 g di macro, il gestionale (in due punti) fino a
     * 9999 di entrambi. Un amministratore poteva quindi scrivere
     * `protein: 9999` per 100 g, un numero che nessun alimento vero puo'
     * avere, attraverso due delle tre porte.
     *
     * Si parte dal tetto dell'app, non da quello piu' permissivo del
     * gestionale: e' quello con cui gli utenti convivono gia', ed e' il piu'
     * stretto dei due - allargarlo agli altri due significherebbe accettare
     * l'errore che il terzo doveva prevenire.
     */
    public const MAX_KCAL = 1000;

    /**
     * Nessun macro - proteine, carboidrati, zuccheri, grassi, grassi saturi,
     * fibre, sale - puo' superare i 100 g per 100 g di alimento: e' un
     * vincolo fisico (non si puo' pesare piu' di quanto pesa il tutto), non
     * di prodotto, e vale per tutti e sette allo stesso modo.
     */
    public const MAX_NUTRIENT_GRAMS = 100;

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
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * Chi ha proposto la voce.
     *
     * ESCE SOLO DALLE ROTTE `/api/admin/*`. Verso un utente normale il
     * catalogo continua a non dire di chi e' una voce, e la migrazione della
     * tabella spiega perche': sapere che un esercizio l'ha inventato Tizio e'
     * un fatto su Tizio, e non serve a nessuno per allenarsi.
     */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
