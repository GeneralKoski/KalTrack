<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminFoodRequest;
use App\Models\Food;
use App\Support\CatalogPhoto;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Il catalogo degli alimenti, dal gestionale.
 *
 * Distinto da `FoodController`, che serve l'app, per la stessa ragione per
 * cui `AdminExerciseController` e' distinto dal suo: due pubblici, due forme,
 * e nessun campo pensato per l'amministratore che possa uscire verso tutti.
 */
class AdminFoodController extends Controller
{
    private const PER_PAGE = 50;

    /** camelCase in ingresso, colonna in uscita. Un posto solo. */
    private const CAMPI = [
        'brand' => 'brand',
        'barcode' => 'barcode',
        'offId' => 'off_id',
        'kcal' => 'kcal',
        'protein' => 'protein',
        'carbs' => 'carbs',
        'sugars' => 'sugars',
        'fat' => 'fat',
        'saturatedFat' => 'saturated_fat',
        'fiber' => 'fiber',
        'salt' => 'salt',
        'isLiquid' => 'is_liquid',
        'defaultServingG' => 'default_serving_g',
        'servingLabel' => 'serving_label',
    ];

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $barcode = trim((string) $request->query('barcode', ''));

        $pagina = Food::query()
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->when($barcode !== '', fn ($q) => $q->where('barcode', $barcode))
            ->orderBy('name_norm')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($pagina->items())->map(fn (Food $f) => $this->forma($f)),
            'meta' => [
                'total' => $pagina->total(),
                'page' => $pagina->currentPage(),
                'lastPage' => $pagina->lastPage(),
            ],
        ]);
    }

    public function store(AdminFoodRequest $request): JsonResponse
    {
        $dati = $request->safe()->all();
        $norm = Text::normalize($dati['name']);

        if ($errore = $this->nomeLibero($norm, null)) {
            return $errore;
        }

        $food = new Food([
            'uid' => (string) Str::uuid(),
            'name' => trim($dati['name']),
            'name_norm' => $norm,
            'status' => 'published',
            'created_by' => null,
        ]);

        foreach (self::CAMPI as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $food->{$colonna} = $dati[$input];
            }
        }

        $food->save();

        return response()->json(['data' => $this->forma($food)], 201);
    }

    public function update(AdminFoodRequest $request, Food $food): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($errore = $this->nomeLibero($norm, $food->id)) {
                return $errore;
            }

            $food->name = trim($dati['name']);
            $food->name_norm = $norm;
        }

        /*
         * Solo cio' che e' arrivato.
         *
         * Da web si corregge un campo alla volta, e una PATCH parziale che
         * azzerasse il resto sarebbe un modo silenzioso di rovinare una voce:
         * si corregge il sale e si perdono le proteine.
         */
        foreach (self::CAMPI as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $food->{$colonna} = $dati[$input];
            }
        }

        $food->save();

        return response()->json(['data' => $this->forma($food->fresh())]);
    }

    public function destroy(Food $food): JsonResponse
    {
        // Morbida, come per gli esercizi: `deleted_at` e' cio' che permette
        // al pull di dire ai telefoni che la voce e' stata tolta.
        $food->delete();

        return response()->json(['ok' => true]);
    }

    public function image(Request $request, Food $food): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:'.CatalogPhoto::MIMES, 'max:'.CatalogPhoto::MAX_KB],
        ]);

        $vecchia = $food->image;
        $food->image = CatalogPhoto::store($request->file('file'));
        $food->save();

        CatalogPhoto::forget($vecchia);

        return response()->json(['image' => $food->image]);
    }

    private function nomeLibero(string $norm, ?int $escluso): ?JsonResponse
    {
        if ($norm === '') {
            return response()->json([
                'message' => 'Il nome dell\'alimento non puo\' essere vuoto.',
                'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
            ], 422);
        }

        $occupato = Food::withTrashed()
            ->where('name_norm', $norm)
            ->when($escluso !== null, fn ($q) => $q->whereKeyNot($escluso))
            ->exists();

        if ($occupato) {
            return response()->json([
                'message' => 'C\'e\' gia\' un alimento con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function forma(Food $f): array
    {
        return [
            'id' => $f->id,
            'uid' => $f->uid,
            'name' => $f->name,
            'brand' => $f->brand,
            'barcode' => $f->barcode,
            'offId' => $f->off_id,
            'kcal' => $f->kcal,
            'protein' => $f->protein,
            'carbs' => $f->carbs,
            'sugars' => $f->sugars,
            'fat' => $f->fat,
            'saturatedFat' => $f->saturated_fat,
            'fiber' => $f->fiber,
            'salt' => $f->salt,
            'isLiquid' => $f->is_liquid,
            'defaultServingG' => $f->default_serving_g,
            'servingLabel' => $f->serving_label,
            'image' => $f->image,
            'status' => $f->status,
            'createdAt' => $f->created_at?->toIso8601String(),
            'updatedAt' => $f->updated_at?->toIso8601String(),
        ];
    }
}
