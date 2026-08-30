<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id',
    'date',
    'exercise_name',
    'sets',
    'total_reps',
    'volume_kg',
    'top_weight_kg',
])]
class SharedWorkout extends Model
{
    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'volume_kg' => 'float',
            'top_weight_kg' => 'float',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
