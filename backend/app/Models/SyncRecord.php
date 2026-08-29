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
