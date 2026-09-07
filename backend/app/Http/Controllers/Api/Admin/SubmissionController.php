<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\ReviewSubmissionRequest;
use App\Models\Exercise;
use App\Models\Food;
use App\Support\Text;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * La coda di revisione.
 *
 * Cio' che un utente si crea sul telefono resta suo e viene PROPOSTO: entra
 * nel catalogo di tutti quando qualcuno lo decide qui. E' il rovesciamento
 * della regola con cui questo server e' nato - "un esercizio creato a mano
 * entra nell'elenco di chiunque" - e la ragione e' che il catalogo di tutti
 * non puo' essere la somma di quel che ciascuno scrive di getto: manca
 * l'alimento della Lidl, uno se lo aggiunge coi valori che ha letto male, e
 * da li' in poi ce l'hanno tutti.
 *
 * Una coda sola per due tipi, perche' e' un gesto solo: si guardano le
 * proposte, non "le proposte di alimenti" e poi "le proposte di esercizi".
 */
class SubmissionController extends Controller
{
    /** Quante ne mostra una pagina. */
    private const PER_PAGE = 100;

    /**
     * I due tipi che si revisionano.
     *
     * Una mappa e non un `match` sparso: il tipo arriva dalla URL, e un
     * elenco chiuso in un punto solo e' cio' che impedisce a `?type=users` di
     * diventare qualcosa.
     */
    private const TIPI = [
        'exercise' => Exercise::class,
        'food' => Food::class,
    ];

    public function index(Request $request): JsonResponse
    {
        $tipo = (string) $request->query('type', 'exercise');
        $classe = $this->classeDi($tipo);

        $stato = (string) $request->query('status', 'pending');
        abort_unless(in_array($stato, Exercise::STATUSES, true), 404);

        $term = Text::normalize((string) $request->query('q', ''));

        $righe = $classe::query()
            ->where('status', $stato)
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            // Gli autori in una query sola: con duecento proposte in coda,
            // leggere l'autore riga per riga sono duecento query.
            ->with('author:id,handle,display_name,name')
            ->orderByDesc('created_at')
            ->limit(self::PER_PAGE)
            ->get();

        return response()->json([
            'data' => $righe->map(fn (Model $r) => $this->forma($r, $tipo)),
        ]);
    }

    public function approve(ReviewSubmissionRequest $request, string $type, int $id): JsonResponse
    {
        $riga = $this->trova($type, $id);
        $dati = $request->safe()->all();

        if ($errore = $this->applicaCorrezioni($riga, $dati, $type)) {
            return $errore;
        }

        $riga->fill([
            'status' => 'published',
            'reviewed_at' => Carbon::now(),
            'reviewed_by' => $request->user()->id,
            // Una nota di rifiuto non ha senso su una voce approvata, e
            // lasciarla scritta racconterebbe una storia sbagliata la
            // prossima volta che qualcuno la guarda.
            'review_note' => null,
        ])->save();

        return response()->json(['data' => $this->forma($riga->fresh(), $type)]);
    }

    public function reject(ReviewSubmissionRequest $request, string $type, int $id): JsonResponse
    {
        $riga = $this->trova($type, $id);

        $riga->fill([
            'status' => 'rejected',
            'reviewed_at' => Carbon::now(),
            'reviewed_by' => $request->user()->id,
            'review_note' => $request->safe()->all()['note'] ?? null,
        ])->save();

        /*
         * La riga resta, e non e' una svista.
         *
         * L'autore ce l'ha comunque sul telefono, dove nessuno gliela tocca:
         * rifiutare vuol dire "non entra nel catalogo di tutti", non
         * "sparisce". E la nota serve il giorno in cui gliela si dira' - oggi
         * non c'e' niente che gliela mostri, e la spec lo dichiara.
         */
        return response()->json(['ok' => true]);
    }

    /**
     * Scrive sulla riga i campi corretti in revisione.
     *
     * Torna una risposta di errore, o null se e' andata. Il caso da fermare e'
     * uno solo: correggere il nome addosso a una voce che c'e' gia'. Il
     * vincolo unico su `name_norm` risponderebbe comunque, ma con un errore
     * del database che a schermo non si puo' leggere.
     */
    private function applicaCorrezioni(Model $riga, array $dati, string $type): ?JsonResponse
    {
        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($norm === '') {
                return response()->json([
                    'message' => 'Il nome non puo\' essere vuoto.',
                    'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
                ], 422);
            }

            $classe = $this->classeDi($type);
            $altra = $classe::query()
                ->where('name_norm', $norm)
                ->whereKeyNot($riga->id)
                ->exists();

            if ($altra) {
                return response()->json([
                    'message' => 'C\'e\' gia\' una voce con questo nome in catalogo.',
                    'errors' => ['name' => ['Nome gia\' in catalogo.']],
                ], 422);
            }

            $riga->name = trim($dati['name']);
            $riga->name_norm = $norm;
        }

        // Mappatura esplicita camelCase -> colonna, come in
        // `ProfileController::update`: un `fill()` cieco accetterebbe
        // qualunque chiave abbia passato la validazione.
        $map = $type === 'exercise'
            ? [
                'muscleGroup' => 'muscle_group',
                'secondaryMuscles' => 'secondary_muscles',
                'equipment' => 'equipment',
                'instructions' => 'instructions',
            ]
            : [
                'brand' => 'brand',
                'barcode' => 'barcode',
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

        foreach ($map as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $riga->{$colonna} = $dati[$input];
            }
        }

        return null;
    }

    /** @return class-string<Model> */
    private function classeDi(string $type): string
    {
        // 404 e non 422: un tipo che non esiste e' una URL che non esiste.
        abort_unless(array_key_exists($type, self::TIPI), 404);

        return self::TIPI[$type];
    }

    private function trova(string $type, int $id): Model
    {
        return $this->classeDi($type)::query()->findOrFail($id);
    }

    /** @return array<string, mixed> */
    private function forma(Model $riga, string $type): array
    {
        $comuni = [
            'id' => $riga->id,
            'type' => $type,
            'uid' => $riga->uid,
            'name' => $riga->name,
            'status' => $riga->status,
            'reviewNote' => $riga->review_note,
            'createdAt' => $riga->created_at?->toIso8601String(),
            'author' => $riga->author === null ? null : [
                'handle' => $riga->author->handle,
                'displayName' => $riga->author->display_name ?? $riga->author->name,
            ],
        ];

        $campi = $type === 'exercise'
            ? [
                'muscleGroup' => $riga->muscle_group,
                'secondaryMuscles' => $riga->secondary_muscles,
                'equipment' => $riga->equipment,
                'instructions' => $riga->instructions,
                'photo' => $riga->photo,
            ]
            : [
                'brand' => $riga->brand,
                'barcode' => $riga->barcode,
                'offId' => $riga->off_id,
                'kcal' => $riga->kcal,
                'protein' => $riga->protein,
                'carbs' => $riga->carbs,
                'sugars' => $riga->sugars,
                'fat' => $riga->fat,
                'saturatedFat' => $riga->saturated_fat,
                'fiber' => $riga->fiber,
                'salt' => $riga->salt,
                'isLiquid' => $riga->is_liquid,
                'defaultServingG' => $riga->default_serving_g,
                'servingLabel' => $riga->serving_label,
                'image' => $riga->image,
            ];

        return [...$comuni, 'fields' => $campi];
    }
}
