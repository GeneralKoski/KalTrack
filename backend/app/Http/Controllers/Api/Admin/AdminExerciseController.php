<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\AdminExerciseRequest;
use App\Models\Exercise;
use App\Support\CatalogPhoto;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Il catalogo degli esercizi, dal gestionale.
 *
 * Distinto da `ExerciseController`, che serve l'app: quello espone `mine` e
 * nasconde l'autore, questo espone l'autore e non ha bisogno di `mine`. Due
 * pubblici diversi, due forme diverse, e tenerli separati e' cio' che
 * impedisce a un campo pensato per l'amministratore di uscire verso tutti.
 *
 * Qui non c'e' il vincolo "solo le proprie": chi amministra corregge
 * qualunque voce, ed e' il punto del gestionale.
 */
class AdminExerciseController extends Controller
{
    private const PER_PAGE = 50;

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $gruppo = (string) $request->query('muscleGroup', '');
        $attrezzo = (string) $request->query('equipment', '');
        $manca = (string) $request->query('missing', '');

        $pagina = Exercise::query()
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->when($gruppo !== '', fn ($q) => $q->where('muscle_group', $gruppo))
            /*
             * `equipment` e' un elenco separato da virgole in colonna, quindi
             * il filtro e' un LIKE. Con le virgole intorno, o "panca"
             * troverebbe anche un ipotetico "panca-piana".
             *
             * Il valore va sfuggito prima di entrare nel pattern: `_` e' un
             * jolly di LIKE che vale "un carattere qualunque", e uno slug con
             * un underscore (es. "corpo_libero") combacerebbe anche con un
             * ipotetico "corpoXlibero" senza la fuga e la clausola `ESCAPE`.
             */
            ->when($attrezzo !== '', fn ($q) => $q->whereRaw(
                "',' || equipment || ',' LIKE ? ESCAPE '\\'",
                ['%,'.Text::escapeLike($attrezzo).',%'],
            ))
            /*
             * Il filtro con cui si va a colmare cio' che manca. E' l'altra
             * meta' dei due numeri della dashboard: sapere che 128 esercizi
             * sono muti non serve a niente se poi non si sa quali.
             *
             * Ristretto a `status = 'published'` quanto lo e' `AdminController
             * ::stats()`, e non per caso: "manca" e' una domanda sul catalogo,
             * cioe' su quel che tutti hanno gia' in mano, non sulla coda di
             * revisione. Una proposta non ancora approvata non e' un buco nel
             * catalogo, e' una riga in coda con la sua schermata e la sua
             * azione ("revisionala", non "scrivi la descrizione") - e
             * `ExerciseController::store` non raccoglie ne' `instructions` ne'
             * `photo`, quindi ogni proposta in attesa risulterebbe muta a
             * prescindere, gonfiando il filtro oltre il numero che la
             * dashboard promette. Senza questa riga il generico (nessun
             * `missing`) resterebbe comunque su tutti gli stati, com'e' giusto
             * che sia: e' solo il ramo "cosa manca" a doversi allineare al
             * numero che lo introduce.
             */
            ->when($manca !== '', fn ($q) => $q->where('status', 'published'))
            ->when($manca === 'instructions', fn ($q) => $q->where(
                fn ($q2) => $q2->whereNull('instructions')->orWhere('instructions', ''),
            ))
            ->when($manca === 'photo', fn ($q) => $q->whereNull('photo'))
            ->orderBy('name_norm')
            ->paginate(self::PER_PAGE);

        return response()->json([
            'data' => collect($pagina->items())->map(fn (Exercise $e) => $this->forma($e)),
            'meta' => [
                'total' => $pagina->total(),
                'page' => $pagina->currentPage(),
                'lastPage' => $pagina->lastPage(),
            ],
        ]);
    }

    public function store(AdminExerciseRequest $request): JsonResponse
    {
        $dati = $request->safe()->all();
        $norm = Text::normalize($dati['name']);

        if ($errore = $this->nomeLibero($norm, null)) {
            return $errore;
        }

        $esercizio = Exercise::create([
            // L'identita' nasce qui e non cambiera' mai piu'.
            'uid' => (string) Str::uuid(),
            'name' => trim($dati['name']),
            'name_norm' => $norm,
            'muscle_group' => $dati['muscleGroup'],
            'secondary_muscles' => $dati['secondaryMuscles'] ?? null,
            'equipment' => $dati['equipment'] ?? null,
            'instructions' => $dati['instructions'] ?? null,
            /*
             * Gia' pubblicato: chi scrive dal gestionale e' la stessa persona
             * che approverebbe, e farlo passare da `pending` vorrebbe dire
             * approvare le proprie voci.
             */
            'status' => 'published',
            'created_by' => null,
        ]);

        return response()->json(['data' => $this->forma($esercizio)], 201);
    }

    public function update(AdminExerciseRequest $request, Exercise $exercise): JsonResponse
    {
        $dati = $request->safe()->all();

        if (array_key_exists('name', $dati)) {
            $norm = Text::normalize($dati['name']);

            if ($errore = $this->nomeLibero($norm, $exercise->id)) {
                return $errore;
            }

            $exercise->name = trim($dati['name']);
            $exercise->name_norm = $norm;
        }

        $map = [
            'muscleGroup' => 'muscle_group',
            'secondaryMuscles' => 'secondary_muscles',
            'equipment' => 'equipment',
            'instructions' => 'instructions',
        ];
        foreach ($map as $input => $colonna) {
            if (array_key_exists($input, $dati)) {
                $exercise->{$colonna} = $dati[$input];
            }
        }

        $exercise->save();

        return response()->json(['data' => $this->forma($exercise->fresh())]);
    }

    public function destroy(Exercise $exercise): JsonResponse
    {
        /*
         * Cancellazione morbida, e la foto resta.
         *
         * `deleted_at` e' quel che permette al pull di dire ai telefoni che
         * la voce e' stata tolta; una cancellazione vera non avrebbe modo di
         * raccontarsi. E finche' la riga si puo' ripescare, buttarne il file
         * vorrebbe dire ripescarla senza immagine.
         */
        $exercise->delete();

        return response()->json(['ok' => true]);
    }

    public function photo(Request $request, Exercise $exercise): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:'.CatalogPhoto::MIMES, 'max:'.CatalogPhoto::MAX_KB],
        ]);

        $vecchia = $exercise->photo;
        $exercise->photo = CatalogPhoto::store($request->file('file'));
        $exercise->save();

        // Dopo il salvataggio: se la scrittura fallisse, la riga
        // continuerebbe a nominare un file che abbiamo appena buttato.
        CatalogPhoto::forget($vecchia);

        return response()->json(['photo' => $exercise->photo]);
    }

    /** Il nome e' libero? Torna la risposta di errore, o null. */
    private function nomeLibero(string $norm, ?int $escluso): ?JsonResponse
    {
        if ($norm === '') {
            return response()->json([
                'message' => 'Il nome dell\'esercizio non puo\' essere vuoto.',
                'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
            ], 422);
        }

        // Anche fra i cancellati: `name_norm` e' unico sull'intera tabella, e
        // senza `withTrashed` risponderebbe il database con un errore che a
        // schermo non si legge.
        $occupato = Exercise::withTrashed()
            ->where('name_norm', $norm)
            ->when($escluso !== null, fn ($q) => $q->whereKeyNot($escluso))
            ->exists();

        if ($occupato) {
            return response()->json([
                'message' => 'C\'e\' gia\' un esercizio con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function forma(Exercise $e): array
    {
        return [
            'id' => $e->id,
            'uid' => $e->uid,
            'name' => $e->name,
            'muscleGroup' => $e->muscle_group,
            'secondaryMuscles' => $e->secondary_muscles,
            'equipment' => $e->equipment,
            'instructions' => $e->instructions,
            'photo' => $e->photo,
            'status' => $e->status,
            'createdAt' => $e->created_at?->toIso8601String(),
            'updatedAt' => $e->updated_at?->toIso8601String(),
        ];
    }
}
