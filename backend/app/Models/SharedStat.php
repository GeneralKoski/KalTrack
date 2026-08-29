<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'date', 'kcal', 'steps', 'weight_kg', 'workouts'])]
class SharedStat extends Model
{
    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'weight_kg' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
