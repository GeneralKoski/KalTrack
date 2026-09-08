<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\MuscleGroup;
use App\Support\FileName;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Il catalogo comune, per l'app.
 *
 * Sostituisce l'`index` di `ExerciseController` e `FoodController` nel giorno
 * in cui l'app sara' aggiornata, ma non lo cancella: un telefono con la build
 * di ieri continua a chiamare `/api/exercises` e deve continuare a
 * funzionare. Le due letture vecchie restano finche' non serviranno piu' a
 * nessuno.
 *
 * QUEL CHE CAMBIA E' CHE QUESTA E' INCREMENTALE. La vecchia mandava tutto il
 * catalogo ogni volta e il telefono inseriva cio' che gli mancava; qui si
 * manda `since` e torna cio' che e' cambiato dopo, cancellazioni comprese. E'
 * la differenza fra un catalogo che si integra e uno che si aggiorna, ed e'
 * l'unica forma in cui una descrizione corretta dal gestionale puo' arrivare
 * su una riga che il telefono ha gia'.
 */
class CatalogController extends Controller
{
    /** Quante voci per pagina, e il tetto a quante se ne possono chiedere. */
    private const PER_PAGE = 200;

    public function exercises(Request $request): JsonResponse
    {
        return $this->pull($request, Exercise::query(), fn (Exercise $e, int $userId) => [
            'uid' => $e->uid,
            'name' => $e->name,
            'nameNorm' => $e->name_norm,
            'muscleGroup' => $e->muscle_group,
            'secondaryMuscles' => $e->secondary_muscles,
            'equipment' => $e->equipment,
            'instructions' => $e->instructions,
            'photo' => $e->photo,
            // Lo stesso campo del vecchio `ExerciseController::index`: dice
            // a chi guarda se puo' correggerla, senza dire a nessuno di chi
            // e'. `created_by` resta dentro il modello e basta, mai qui.
            'mine' => $e->created_by !== null && $e->created_by === $userId,
        ]);
    }

    public function foods(Request $request): JsonResponse
    {
        return $this->pull($request, Food::query(), fn (Food $f, int $userId) => [
            'uid' => $f->uid,
            'name' => $f->name,
            'nameNorm' => $f->name_norm,
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
            'mine' => $f->created_by !== null && $f->created_by === $userId,
        ]);
    }

    /**
     * I gruppi muscolari e gli attrezzi che il catalogo conosce.
     *
     * Escono INTERI a ogni chiamata, cancellati compresi, e non
     * incrementalmente: sono ventitre' righe in tutto, e un cursore su
     * ventitre' righe e' complessita' che non compra niente.
     *
     * I cancellati escono con la loro data invece di sparire. Sul telefono
     * ci sono esercizi che nominano quello slug in colonna: togliere la riga
     * senza dire niente li lascerebbe senza etichetta, e chi la cerca
     * penserebbe a un difetto dell'app.
     */
    public function taxonomies(): JsonResponse
    {
        $forma = fn ($riga) => [
            'slug' => $riga->slug,
            'labelIt' => $riga->label_it,
            'labelEn' => $riga->label_en,
            'sort' => $riga->sort,
            'deletedAt' => $riga->deleted_at?->toIso8601String(),
        ];

        return response()->json([
            'muscleGroups' => MuscleGroup::withTrashed()
                ->orderBy('sort')->orderBy('slug')->get()->map($forma),
            'equipment' => EquipmentType::withTrashed()
                ->orderBy('sort')->orderBy('slug')->get()->map($forma),
        ]);
    }

    /**
     * I byte di una foto del catalogo.
     *
     * Stanno in `storage/app/private/catalog/` e NON sotto
     * `images/{utente}/`: una foto di catalogo e' comune a tutti gli
     * iscritti, e il percorso per utente la renderebbe di uno solo - il primo
     * che l'ha caricata - lasciando gli altri con un rettangolo vuoto.
     *
     * Resta fuori da `public/` come le foto dei progressi: sotto
     * `auth:sanctum` come tutto il resto di questa API. Il catalogo e' di
     * tutti gli iscritti, non del mondo.
     *
     * Il nome si controlla con `FileName`, condivisa con `ImageController`
     * per lo stesso motivo: il nome finisce in un percorso su disco.
     *
     * `response()` e non `download()`: questi byte si mostrano, non si
     * salvano, a differenza di una foto dei progressi.
     */
    public function image(string $name): StreamedResponse
    {
        abort_unless(FileName::isAcceptable($name), 404);

        $percorso = "catalog/{$name}";
        abort_unless(Storage::disk('local')->exists($percorso), 404);

        return Storage::disk('local')->response($percorso);
    }

    /**
     * Una pagina di catalogo, dalla coppia (updated_at, id) in poi.
     *
     * IL CURSORE E' UNA COPPIA E NON UN TIMESTAMP, e non e' un
     * raffinamento: Laravel scrive i timestamp al secondo, e `catalog:seed`
     * inserisce duecento righe nello stesso secondo. Con `>` sul solo
     * `updated_at` la seconda pagina salterebbe centonovantanove righe; con
     * `>=` le rimanderebbe per sempre. Il confronto e' quindi "istante
     * maggiore, oppure istante uguale e id maggiore", e l'ordinamento e' su
     * entrambe le colonne.
     *
     * @param  callable(Model, int): array<string, mixed>  $forma
     */
    private function pull(Request $request, Builder $query, callable $forma): JsonResponse
    {
        /*
         * Uno `since` vuoto e uno assente sono la stessa cosa per chi lo
         * manda: la differenza fra "non ho ancora niente" e "ho tutto fino
         * ad ora" e' la differenza fra ricevere il catalogo e non ricevere
         * niente. Si normalizza PRIMA di validare, o la regola `date`
         * boccerebbe una stringa vuota che non e' un errore, e' un altro
         * modo di dire "assente".
         */
        if ($request->query('since') === '') {
            $request->merge(['since' => null]);
        }

        /*
         * I tre parametri si validano, non si limano con `min()`: un
         * `limit` negativo passava indenne il vecchio `min($limit,
         * PER_PAGE)` - Laravel non applica affatto un `limit()` negativo, e
         * la query tornava la tabella intera - e un `limit=0` mandava
         * `$righe->last()` su una collezione vuota, cioe' un 500. Un
         * `since` che non si legge come data era lo stesso 500, da
         * `Carbon::parse`. Un rifiuto leggibile (422) e' meglio di tutti e
         * tre.
         */
        $validated = $request->validate([
            'since' => ['nullable', 'date'],
            'afterId' => ['nullable', 'integer', 'min:0'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:'.self::PER_PAGE],
        ]);

        $since = $validated['since'] ?? null;
        $afterId = (int) ($validated['afterId'] ?? 0);
        $limit = (int) ($validated['limit'] ?? self::PER_PAGE);
        $userId = $request->user()->id;

        /*
         * Le cancellazioni escono SOLO in un pull incrementale.
         *
         * Al primo pull il telefono non ha niente, quindi una voce cancellata
         * non e' qualcosa da togliergli: e' qualcosa che non ha mai avuto, e
         * mandargliene il tombstone gli farebbe cercare una riga inesistente.
         */
        if ($since !== null) {
            $query->withTrashed();
        }

        $query->where('status', 'published');

        if ($since !== null) {
            $da = Carbon::parse($since);

            $query->where(function (Builder $q) use ($da, $afterId) {
                $q->where('updated_at', '>', $da)
                    ->orWhere(function (Builder $q2) use ($da, $afterId) {
                        $q2->where('updated_at', '=', $da)
                            ->where('id', '>', $afterId);
                    });
            });
        }

        $righe = $query
            ->orderBy('updated_at')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        /*
         * Due campi e non uno, e la differenza e' la domanda a cui rispondono.
         *
         * `cursor` e' DOVE SIAMO ARRIVATI, e c'e' sempre tranne che su una
         * pagina vuota. `next` e' SE C'E' ALTRO DA CHIEDERE, e sparisce
         * appena la pagina non e' piena.
         *
         * Con `next` da solo il telefono non sapeva dove fosse arrivato
         * quando la pagina non era piena - e l'ultima pagina non lo e' mai:
         * di una voce non esce `updated_at`, e di un tombstone escono solo
         * `uid` e `deletedAt`, quindi la posizione non e' ricavabile dal
         * contenuto. Il risultato era la coda del catalogo riscaricata e
         * riapplicata a ogni giro, in silenzio perche' idempotente.
         */
        $ultima = $righe->last();
        $posizione = $ultima === null ? null : [
            'since' => $ultima->updated_at->toIso8601String(),
            'afterId' => $ultima->id,
        ];

        return response()->json([
            'data' => $righe->map(function (Model $riga) use ($forma, $userId) {
                /*
                 * Di una voce cancellata esce solo l'identita' e la data.
                 *
                 * Il telefono con quel `uid` non deve riscrivere niente: deve
                 * smettere di considerarla catalogo. Mandarne anche il
                 * contenuto sarebbe un invito a riscriverla, e prima o poi
                 * qualcuno lo farebbe - `mine` compreso: non e' contenuto,
                 * ma non e' nemmeno identita', e questa regola non si piega
                 * per un campo comodo in piu'.
                 */
                if ($riga->deleted_at !== null) {
                    return [
                        'uid' => $riga->uid,
                        'deletedAt' => $riga->deleted_at->toIso8601String(),
                    ];
                }

                return [...$forma($riga, $userId), 'deletedAt' => null];
            }),
            'cursor' => $posizione,
            'next' => $righe->count() === $limit ? $posizione : null,
        ]);
    }
}
