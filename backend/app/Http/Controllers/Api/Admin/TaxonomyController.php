<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\TaxonomyRequest;
use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\MuscleGroup;
use App\Support\Text;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;

/**
 * I gruppi muscolari e gli attrezzi, dal gestionale.
 *
 * Un controller per due tipi, perche' sono la stessa tabella con un nome
 * diverso e le stesse quattro colonne: due controller gemelli divergerebbero
 * alla prima correzione fatta in uno solo.
 */
class TaxonomyController extends Controller
{
    /**
     * @var array<string, array{class-string<Model>, string}>
     *
     * Il tipo, il model, e la colonna degli esercizi che lo nomina - serve a
     * sapere se una voce e' ancora in uso prima di toglierla.
     */
    private const TIPI = [
        'muscle-groups' => [MuscleGroup::class, 'muscle_group'],
        'equipment' => [EquipmentType::class, 'equipment'],
    ];

    /**
     * Cio' che non si cancella mai.
     *
     * `corpo_libero` sta in `EquipmentScreen` come sempre presente, e
     * `listAvailableEquipment` ragiona per esclusione a partire da li':
     * toglierlo cambierebbe il significato di ogni dichiarazione di
     * attrezzatura gia' fatta da chiunque.
     */
    private const INTOCCABILI = ['corpo_libero'];

    public function index(string $kind): JsonResponse
    {
        [$classe] = $this->tipo($kind);

        return response()->json([
            'data' => $classe::query()
                ->orderBy('sort')->orderBy('slug')->get()
                ->map(fn (Model $r) => $this->forma($r)),
        ]);
    }

    public function store(TaxonomyRequest $request, string $kind): JsonResponse
    {
        [$classe] = $this->tipo($kind);
        $dati = $request->safe()->all();

        if ($classe::withTrashed()->where('slug', $dati['slug'])->exists()) {
            return response()->json([
                'message' => 'Questo identificativo e\' gia\' in uso.',
                'errors' => ['slug' => ['Identificativo gia\' in uso.']],
            ], 422);
        }

        $riga = $classe::create([
            'slug' => $dati['slug'],
            'label_it' => $dati['labelIt'],
            'label_en' => $dati['labelEn'],
            'sort' => $dati['sort'] ?? 0,
        ]);

        return response()->json(['data' => $this->forma($riga)], 201);
    }

    public function update(TaxonomyRequest $request, string $kind, int $id): JsonResponse
    {
        [$classe] = $this->tipo($kind);
        $riga = $classe::query()->findOrFail($id);
        $dati = $request->safe()->all();

        /*
         * `slug` non e' in questo elenco, ed e' il punto.
         *
         * Arriva nella richiesta perche' il form lo mostra, e viene ignorato:
         * e' quel che sta scritto in colonna su ogni esercizio che nomina
         * questa voce, e riscriverlo li lascerebbe orfani tutti in una volta,
         * qui e su ogni telefono. Rinominare "Femorali" in "Ischiocrurali" e'
         * un fatto sull'etichetta.
         */
        foreach (['labelIt' => 'label_it', 'labelEn' => 'label_en', 'sort' => 'sort'] as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $riga->{$colonna} = $dati[$input];
            }
        }

        $riga->save();

        return response()->json(['data' => $this->forma($riga->fresh())]);
    }

    public function destroy(string $kind, int $id): JsonResponse
    {
        [$classe, $colonna] = $this->tipo($kind);
        $riga = $classe::query()->findOrFail($id);

        if (in_array($riga->slug, self::INTOCCABILI, true)) {
            return response()->json([
                'message' => 'Questa voce non si puo\' togliere.',
                'errors' => ['slug' => ['Voce di sistema.']],
            ], 422);
        }

        $usi = $this->usi($colonna, $riga->slug);

        if ($usi > 0) {
            /*
             * Non si toglie da sotto ai piedi di chi la usa.
             *
             * Il pull manderebbe comunque il tombstone e l'app ha una
             * ricaduta neutra, ma un elenco di esercizi senza gruppo e' un
             * danno che si evita chiedendo prima di spostarli.
             */
            return response()->json([
                'message' => "Ci sono ancora {$usi} voci che usano questo identificativo.",
                'errors' => ['slug' => ["Ci sono ancora {$usi} voci che lo usano."]],
            ], 422);
        }

        $riga->delete();

        return response()->json(['ok' => true]);
    }

    /** Quanti esercizi nominano ancora questo slug. */
    private function usi(string $colonna, string $slug): int
    {
        /*
         * Lo slug entra in un pattern LIKE (per trovarlo dentro un elenco
         * separato da virgole) e va sfuggito prima: `_` e' un jolly di LIKE
         * che vale "un carattere qualunque", e slug come "corpo_libero" o
         * "full_body" ne contengono uno. Senza fuga, "corpo_libero"
         * combacerebbe anche con un ipotetico "corpoXlibero" - un errore che
         * pende dal lato sicuro (si sovraconta, quindi si rifiuta una
         * cancellazione di troppo) ma resta un conteggio sbagliato dentro il
         * controllo che decide se una voce si puo' togliere.
         */
        $sfuggito = Text::escapeLike($slug);

        if ($colonna === 'muscle_group') {
            // Il gruppo primario e i secondari, che sono un elenco separato
            // da virgole: una voce usata solo come secondaria e' comunque
            // usata.
            return Exercise::withTrashed()
                ->where('muscle_group', $slug)
                ->orWhereRaw(
                    "',' || COALESCE(secondary_muscles, '') || ',' LIKE ? ESCAPE '\\'",
                    ["%,{$sfuggito},%"],
                )
                ->count();
        }

        return Exercise::withTrashed()
            ->whereRaw(
                "',' || COALESCE(equipment, '') || ',' LIKE ? ESCAPE '\\'",
                ["%,{$sfuggito},%"],
            )
            ->count();
    }

    /** @return array{class-string<Model>, string} */
    private function tipo(string $kind): array
    {
        abort_unless(array_key_exists($kind, self::TIPI), 404);

        return self::TIPI[$kind];
    }

    /** @return array<string, mixed> */
    private function forma(Model $r): array
    {
        return [
            'id' => $r->id,
            'slug' => $r->slug,
            'labelIt' => $r->label_it,
            'labelEn' => $r->label_en,
            'sort' => $r->sort,
        ];
    }
}
