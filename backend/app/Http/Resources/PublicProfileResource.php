<?php

namespace App\Http\Resources;

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
            'shares' => [
                'calories' => $user->share_calories,
                'steps' => $user->share_steps,
                'weight' => $user->share_weight,
                'workouts' => $user->share_workouts,
            ],
        ];
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
