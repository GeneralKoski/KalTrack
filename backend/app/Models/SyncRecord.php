<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'table_name',
    'record_id',
    'payload',
    'updated_at',
    'deleted_at',
    'created_at',
    'sequence',
])]
class SyncRecord extends Model
{
    /**
     * `updated_at` arriva dal telefono e non deve essere riscritto da Eloquent:
     * e' il criterio con cui si decide chi vince un conflitto.
     */
    public $timestamps = false;

    /**
     * Con i millesimi, e non e' un dettaglio.
     *
     * Il formato di serie di Eloquent tronca al secondo. Chi vince un
     * conflitto si decide confrontando queste ore, e due modifiche fatte nello
     * stesso secondo su due telefoni diventavano indistinguibili: passava
     * l'ultima arrivata invece dell'ultima scritta. Peggio, una copia piu'
     * VECCHIA poteva sovrascrivere quella buona, e il telefono che aveva
     * ragione non la rimandava piu' perche' per lui era gia' inviata.
     *
     * Le righe scritte prima di questo cambio restano leggibili: quando il
     * formato non combacia Eloquent ricade su Carbon::parse.
     */
    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
            'created_at' => 'datetime',
            'synced_at' => 'datetime',
            'sequence' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
