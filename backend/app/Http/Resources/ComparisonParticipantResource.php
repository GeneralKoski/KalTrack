<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Una persona dentro il confronto a piu' colonne.
 *
 * QUESTA CLASSE E' IL CONFINE DELLA PRIVACY, come
 * `PublicProfileResource`: ogni numero che esce di qui ha passato gli stessi
 * due controlli - il proprietario ha acceso quella condivisione, e chi guarda
 * e' un suo amico accettato - e i due controlli si applicano **per ciascuno**
 * dei partecipanti, non una volta per la richiesta.
 *
 * Il peso non compare. Non e' una dimenticanza ne' un filtro: "pesi sei chili
 * piu' del tuo amico" non e' una frase che il confronto deve poter dire, e il
 * modo piu' sicuro di non dirla e' non far uscire il numero.
 *
 * @property User $resource
 */
class ComparisonParticipantResource extends JsonResource
{
    /**
     * I numeri arrivano gia' aggregati sul periodo, non come righe del
     * database: su sette giorni "quanti passi" e' una somma e "quante calorie"
     * una media, e quel calcolo e' del controller. Qui si decide solo cosa
     * esce, che e' l'unica cosa che questa classe deve sapere fare.
     *
     * @param  object|null  $stat  `kcal`, `steps`, `workouts`. Null se in quel
     *                             periodo non c'e' nessun giorno registrato.
     * @param  Collection<int, object>  $workouts  `name`, `sets`, `totalReps`,
     *                             `volumeKg`, `topWeightKg`.
     */
    public function __construct(
        $resource,
        private readonly bool $isFriend,
        private readonly ?object $stat,
        private readonly Collection $workouts,
    ) {
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
            'isFriend' => $this->isFriend,
            /*
             * Le condivisioni escono come le vede chi guarda: a un non amico
             * risultano tutte spente. Dire "condivide i passi ma tu non li
             * vedi" sarebbe un'informazione su di lei data a qualcuno che non
             * ha nessun rapporto con lei.
             */
            'shares' => [
                'calories' => $visible($user->share_calories),
                'steps' => $visible($user->share_steps),
                'workouts' => $visible($user->share_workouts),
                'gym' => $visible($user->share_gym),
            ],
            // Null e non zero per quel che non si condivide: "non condiviso" e
            // "non registrato" restano indistinguibili, ed e' giusto cosi',
            // ma nessuno dei due deve diventare uno zero.
            'totals' => [
                'kcal' => $visible($user->share_calories) ? $this->stat?->kcal : null,
                'steps' => $visible($user->share_steps) ? $this->stat?->steps : null,
                'workouts' => $visible($user->share_workouts) ? $this->stat?->workouts : null,
            ],
            'exercises' => $visible($user->share_gym)
                ? $this->workouts->map(fn (object $e) => [
                    'name' => $e->name,
                    'sets' => $e->sets,
                    'totalReps' => $e->totalReps,
                    'volumeKg' => $e->volumeKg,
                    'topWeightKg' => $e->topWeightKg,
                ])->values()
                : [],
        ];
    }
}
