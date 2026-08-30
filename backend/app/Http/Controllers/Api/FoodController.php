<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Food;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Il catalogo degli alimenti, comune a tutti gli iscritti.
 *
 * Gemello di `ExerciseController` e con le stesse regole: deduplica sul nome
 * normalizzato, l'autore si registra ma non esce, e ciascuno corregge o toglie
 * solo le voci che ha aggiunto lui.
 *
 * I valori sono PER 100 g / 100 ml, come sul telefono.
 */
class FoodController extends Controller
{
    private const LIMIT = 200;

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));

        $foods = Food::query()
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->orderBy('name_norm')
            ->limit(self::LIMIT)
            ->get();

        return response()->json([
            'data' => $foods->map(
                fn (Food $f) => $this->publicShape($f, $request->user()->id)
            ),
        ]);
    }

    /**
     * Aggiunge una voce, se non c'e' gia'.
     *
     * Come per gli esercizi, un nome gia' in catalogo non e' un errore: torna
     * la voce che c'era. Dal telefono questa parte quando qualcuno salva un
     * alimento suo, e non deve trasformarsi in un problema da risolvere.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        $food = Food::firstOrCreate(
            ['name_norm' => $norm],
            [...$this->colonne($validated), 'created_by' => $request->user()->id],
        );

        return response()->json([
            'data' => $this->publicShape($food, $request->user()->id),
        ]);
    }

    /** Corregge una voce. SOLO LA PROPRIA. */
    public function update(Request $request, Food $food): JsonResponse
    {
        if ($negato = $this->soloIlProprietario($request, $food->created_by)) {
            return $negato;
        }

        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        $altra = Food::where('name_norm', $norm)
            ->whereKeyNot($food->id)
            ->exists();
        if ($altra) {
            return response()->json([
                'message' => 'C\'e\' gia\' un alimento con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        $food->update([...$this->colonne($validated), 'name_norm' => $norm]);

        return response()->json([
            'data' => $this->publicShape($food, $request->user()->id),
        ]);
    }

    /**
     * Toglie una voce dal catalogo. SOLO LA PROPRIA.
     *
     * Cancellazione vera: questa tabella non si sincronizza con nessun
     * telefono, quindi non c'e' la riga che risorge al giro dopo. Chi l'aveva
     * gia' importata se la tiene.
     */
    public function destroy(Request $request, Food $food): JsonResponse
    {
        if ($negato = $this->soloIlProprietario($request, $food->created_by)) {
            return $negato;
        }

        $food->delete();

        return response()->json(['ok' => true]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            // Per 100 g: un tetto c'e' perche' nessun alimento supera le 900
            // kcal per etto, e i grammi di un macro non passano i cento.
            'kcal' => ['required', 'numeric', 'min:0', 'max:1000'],
            'protein' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'carbs' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'sugars' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'fat' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'saturatedFat' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'fiber' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'salt' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:5000'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
    }

    /**
     * Dal corpo camelCase alle colonne snake_case.
     *
     * Mappatura esplicita e non un `fill()` cieco: quest'ultimo accetterebbe
     * qualunque chiave passasse la validazione, `created_by` compreso.
     */
    private function colonne(array $validated): array
    {
        return [
            'name' => trim($validated['name']),
            'name_norm' => Text::normalize($validated['name']),
            'brand' => $validated['brand'] ?? null,
            'kcal' => $validated['kcal'],
            'protein' => $validated['protein'] ?? 0,
            'carbs' => $validated['carbs'] ?? 0,
            'sugars' => $validated['sugars'] ?? 0,
            'fat' => $validated['fat'] ?? 0,
            'saturated_fat' => $validated['saturatedFat'] ?? 0,
            'fiber' => $validated['fiber'] ?? 0,
            'salt' => $validated['salt'] ?? 0,
            'is_liquid' => $validated['isLiquid'] ?? false,
            'default_serving_g' => $validated['defaultServingG'] ?? null,
            'serving_label' => $validated['servingLabel'] ?? null,
        ];
    }

    private function nomeVuoto(): JsonResponse
    {
        return response()->json([
            'message' => 'Il nome dell\'alimento non puo\' essere vuoto.',
            'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
        ], 422);
    }

    private function soloIlProprietario(Request $request, ?int $autore): ?JsonResponse
    {
        if ($autore !== null && $autore === $request->user()->id) {
            return null;
        }

        return response()->json([
            'message' => 'Puoi modificare solo le voci che hai aggiunto tu.',
        ], 403);
    }

    /**
     * Cosa esce di una voce di catalogo.
     *
     * `created_by` NON C'E': al suo posto esce `mine`, che dice a chi guarda se
     * puo' correggerla senza dire a nessuno chi l'ha scritta.
     */
    private function publicShape(Food $food, int $chiGuarda): array
    {
        return [
            'id' => $food->id,
            'name' => $food->name,
            'nameNorm' => $food->name_norm,
            'brand' => $food->brand,
            'kcal' => $food->kcal,
            'protein' => $food->protein,
            'carbs' => $food->carbs,
            'sugars' => $food->sugars,
            'fat' => $food->fat,
            'saturatedFat' => $food->saturated_fat,
            'fiber' => $food->fiber,
            'salt' => $food->salt,
            'isLiquid' => $food->is_liquid,
            'defaultServingG' => $food->default_serving_g,
            'servingLabel' => $food->serving_label,
            'mine' => $food->created_by !== null
                && $food->created_by === $chiGuarda,
        ];
    }
}
