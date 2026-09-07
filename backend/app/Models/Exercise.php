<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Una voce del catalogo comune.
 *
 * `created_by` c'e' ma non esce mai verso un utente normale: serve a decidere
 * chi puo' correggere una voce, e all'amministratore per sapere chi ha
 * proposto cosa in revisione. Le rotte `/api/catalog/*` non lo espongono, le
 * rotte `/api/admin/*` si'.
 */
#[Fillable([
    'uid',
    'name',
    'name_norm',
    'muscle_group',
    'secondary_muscles',
    'equipment',
    'status',
    'instructions',
    'photo',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'created_by',
])]
class Exercise extends Model
{
    use SoftDeletes;

    /** Gli stati della moderazione. Sta qui perche' li leggono in tre. */
    public const STATUSES = ['pending', 'published', 'rejected'];

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime'];
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
