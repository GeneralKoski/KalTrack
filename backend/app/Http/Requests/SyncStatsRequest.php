<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Il riepilogo che il telefono pubblica.
 *
 * Ogni campo e' nullable: il telefono manda null per quel che non e' stato
 * registrato, e il server lo conserva come null. Trasformarlo in zero
 * inventerebbe una giornata a digiuno.
 */
class SyncStatsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'days' => ['required', 'array', 'min:1', 'max:60'],
            'days.*.date' => ['required', 'date_format:Y-m-d'],
            'days.*.kcal' => ['nullable', 'integer', 'min:0', 'max:30000'],
            'days.*.steps' => ['nullable', 'integer', 'min:0', 'max:200000'],
            'days.*.weightKg' => ['nullable', 'numeric', 'min:20', 'max:400'],
            'days.*.workouts' => ['nullable', 'integer', 'min:0', 'max:20'],
        ];
    }
}
