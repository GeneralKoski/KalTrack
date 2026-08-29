<?php

namespace App\Http\Resources;

use App\Models\SharedStat;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @property SharedStat $resource */
class SharedStatResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'date' => $this->resource->date->format('Y-m-d'),
            'kcal' => $this->resource->kcal,
            'steps' => $this->resource->steps,
            'weightKg' => $this->resource->weight_kg,
            'workouts' => $this->resource->workouts,
        ];
    }
}
