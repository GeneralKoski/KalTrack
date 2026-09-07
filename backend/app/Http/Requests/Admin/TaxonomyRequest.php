<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Una voce di tassonomia.
 *
 * `slug` e' accettato SOLO in creazione, e il controller lo ignora in
 * correzione: e' quel che sta scritto in colonna su ogni esercizio, e
 * cambiarlo li lascerebbe orfani tutti in una volta.
 */
class TaxonomyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Il middleware `admin` ha gia' deciso.
    }

    /**
     * Lo slug si normalizza prima di validarlo.
     *
     * Chi scrive "Lat Machine" nel campo intende `lat_machine`: uno slug con
     * spazi e maiuscole finirebbe in colonna cosi' com'e' e non combacerebbe
     * mai con quel che l'app cerca. Meglio correggerlo che rifiutarlo.
     */
    protected function prepareForValidation(): void
    {
        if ($slug = $this->input('slug')) {
            $normalizzato = preg_replace('/[^a-z0-9]+/', '_', mb_strtolower((string) $slug));
            $this->merge(['slug' => trim((string) $normalizzato, '_')]);
        }
    }

    public function rules(): array
    {
        return [
            'slug' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:40'],
            'labelIt' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:60'],
            'labelEn' => [$this->isMethod('POST') ? 'required' : 'sometimes', 'string', 'max:60'],
            'sort' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ];
    }
}
