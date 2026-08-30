<?php

namespace App\Http\Resources;

use App\Models\SharedWorkout;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Il profilo come lo vede qualcun altro.
 *
 * QUESTA CLASSE E' IL CONFINE DELLA PRIVACY. Ogni numero che esce da qui ha
 * passato due controlli: il proprietario ha acceso quella condivisione, e chi
 * guarda e' un suo amico accettato. Un campo aggiunto senza passare da
 * `shared()` esce per tutti, e nessun test lo direbbe se non c'e' un test.
 *
 * Handle, nome e avatar escono sempre: senza, la ricerca amici non potrebbe
 * mostrare chi hai trovato.
 *
 * @property User $resource
 */
class PublicProfileResource extends JsonResource
{
    /**
     * @param  bool  $isFriend  Deciso dal controller: qui non si fanno query.
     */
    public function __construct($resource, private readonly bool $isFriend)
    {
        parent::__construct($resource);
    }

    public function toArray(Request $request): array
    {
        $user = $this->resource;
        $visible = fn (bool $flag) => $this->isFriend && $flag;

        return [
            'handle' => $user->handle,
            'displayName' => $user->display_name ?? $user->name,
            'avatarUrl' => $user->avatar_url,
            'bio' => $user->bio,
            'isFriend' => $this->isFriend,
            // Le statistiche recenti, gia' filtrate dal controller: qui non si
            // interroga il database (guida resource.md, niente N+1).
            'stats' => $this->whenLoaded(
                'sharedStats',
                fn () => SharedStatResource::collection(
                    $user->sharedStats->map(
                        fn ($stat) => $this->shared($stat, $user)
                    )
                ),
            ),
            /*
             * La palestra, giorno per giorno. Vuota se l'interruttore e'
             * spento o se chi guarda non e' un amico: gli esercizi il
             * controller li carica solo per gli amici, e questo e' il secondo
             * controllo, non il primo.
             */
            'gym' => $visible($user->share_gym)
                ? $this->perGiorno($user->sharedWorkouts)
                : [],
            /*
             * Le condivisioni escono come le vede chi guarda: a un non amico
             * risultano tutte spente. Dire "condivide i passi ma tu non li
             * vedi" sarebbe un'informazione su di lei data a qualcuno che non
             * ha nessun rapporto con lei.
             */
            'shares' => [
                'calories' => $visible($user->share_calories),
                'steps' => $visible($user->share_steps),
                'weight' => $visible($user->share_weight),
                'workouts' => $visible($user->share_workouts),
                'gym' => $visible($user->share_gym),
            ],
        ];
    }

    /**
     * Gli esercizi raggruppati per giorno.
     *
     * Un giorno per riga come `stats`, cosi' le due liste si leggono allo
     * stesso modo: il client prende la piu' recente senza dover incrociare
     * date sparse.
     */
    private function perGiorno(mixed $workouts): array
    {
        return collect($workouts)
            ->groupBy(fn (SharedWorkout $w) => $w->date->toDateString())
            ->map(fn ($righe, $date) => [
                'date' => $date,
                'exercises' => $righe->map(fn (SharedWorkout $w) => [
                    'name' => $w->exercise_name,
                    'sets' => $w->sets,
                    'totalReps' => $w->total_reps,
                    'volumeKg' => $w->volume_kg,
                    'topWeightKg' => $w->top_weight_kg,
                ])->values(),
            ])
            ->sortByDesc('date')
            ->values()
            ->all();
    }

    /**
     * Azzera i campi che il proprietario non condivide o che l'osservatore non
     * ha diritto di vedere. Null e non zero: "non condiviso" e "zero" sono due
     * fatti diversi e vanno restati distinguibili.
     */
    private function shared(mixed $stat, User $owner): mixed
    {
        $visible = fn (bool $flag) => $this->isFriend && $flag;

        $stat->kcal = $visible($owner->share_calories) ? $stat->kcal : null;
        $stat->steps = $visible($owner->share_steps) ? $stat->steps : null;
        $stat->weight_kg = $visible($owner->share_weight) ? $stat->weight_kg : null;
        $stat->workouts = $visible($owner->share_workouts) ? $stat->workouts : null;

        return $stat;
    }
}
