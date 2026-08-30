<?php

namespace App\Http\Requests;

use App\Rules\UniqueHandle;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'handle' => [
                'sometimes',
                'string',
                'min:3',
                'max:30',
                'regex:/^[A-Za-z0-9_]+$/',
                new UniqueHandle($this->user()->id),
            ],
            // L'email si puo' cambiare: e' con quella che si entra, ed era
            // l'unico dato del proprio account che si poteva solo guardare.
            'email' => [
                'sometimes',
                'email',
                'max:255',
                Rule::unique('users')->ignore($this->user()->id),
            ],
            'displayName' => ['sometimes', 'string', 'max:60'],
            'avatarUrl' => ['sometimes', 'nullable', 'url', 'max:255'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:160'],
            'shareCalories' => ['sometimes', 'boolean'],
            'shareSteps' => ['sometimes', 'boolean'],
            'shareWeight' => ['sometimes', 'boolean'],
            'shareWorkouts' => ['sometimes', 'boolean'],
        ];
    }
}
