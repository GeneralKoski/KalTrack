<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Gli allenamenti che il telefono pubblica.
 *
 * `exercises` puo' essere vuoto ma non puo' mancare: un giorno con la lista
 * vuota dice "quel giorno non c'e' piu' niente", ed e' l'unico modo che il
 * telefono ha per cancellare. Un giorno senza la chiave sarebbe invece un
 * giorno di cui non si sta parlando, e i due casi non vanno confusi.
 */
class SyncWorkoutsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'days' => ['required', 'array', 'min:1', 'max:365'],
            'days.*.date' => ['required', 'date_format:Y-m-d'],
            'days.*.exercises' => ['present', 'array', 'max:40'],
            'days.*.exercises.*.name' => ['required', 'string', 'max:120'],
            'days.*.exercises.*.sets' => ['required', 'integer', 'min:1', 'max:100'],
            'days.*.exercises.*.totalReps' => ['required', 'integer', 'min:0', 'max:2000'],
            'days.*.exercises.*.volumeKg' => ['required', 'numeric', 'min:0', 'max:1000000'],
            // Nullable: a corpo libero un carico massimo non esiste, e uno zero
            // direbbe "ha sollevato zero chili" invece di "non si solleva".
            'days.*.exercises.*.topWeightKg' => ['nullable', 'numeric', 'min:0', 'max:1000'],
        ];
    }
}
