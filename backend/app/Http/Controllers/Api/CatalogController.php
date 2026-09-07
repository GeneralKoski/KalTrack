<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use App\Models\Food;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

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
        return $this->pull($request, Exercise::query(), fn (Exercise $e) => [
            'uid' => $e->uid,
            'name' => $e->name,
            'nameNorm' => $e->name_norm,
            'muscleGroup' => $e->muscle_group,
            'secondaryMuscles' => $e->secondary_muscles,
            'equipment' => $e->equipment,
            'instructions' => $e->instructions,
            'photo' => $e->photo,
        ]);
    }

    public function foods(Request $request): JsonResponse
    {
        return $this->pull($request, Food::query(), fn (Food $f) => [
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
        ]);
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
     * @param  callable(Model): array<string, mixed>  $forma
     */
    private function pull(Request $request, Builder $query, callable $forma): JsonResponse
    {
        $since = $request->query('since');
        $afterId = (int) $request->query('afterId', '0');
        $limit = min((int) $request->query('limit', (string) self::PER_PAGE), self::PER_PAGE);

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

        return response()->json([
            'data' => $righe->map(function (Model $riga) use ($forma) {
                /*
                 * Di una voce cancellata esce solo l'identita' e la data.
                 *
                 * Il telefono con quel `uid` non deve riscrivere niente: deve
                 * smettere di considerarla catalogo. Mandarne anche il
                 * contenuto sarebbe un invito a riscriverla, e prima o poi
                 * qualcuno lo farebbe.
                 */
                if ($riga->deleted_at !== null) {
                    return [
                        'uid' => $riga->uid,
                        'deletedAt' => $riga->deleted_at->toIso8601String(),
                    ];
                }

                return [...$forma($riga), 'deletedAt' => null];
            }),
            /*
             * Null quando la pagina non e' piena: non c'e' altro da chiedere.
             * E' la stessa convenzione di `ExerciseController::index`.
             */
            'next' => $righe->count() === $limit
                ? [
                    'since' => $righe->last()->updated_at->toIso8601String(),
                    'afterId' => $righe->last()->id,
                ]
                : null,
        ]);
    }
}
