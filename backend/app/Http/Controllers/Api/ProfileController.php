<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\PublicProfileResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    /** Quanti giorni di storico mostra un profilo. */
    private const HISTORY_DAYS = 30;

    /** Il proprio profilo: qui esce tutto, e' il proprio. */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'handle' => $user->handle,
            'displayName' => $user->display_name ?? $user->name,
            'avatarUrl' => $user->avatar_url,
            'bio' => $user->bio,
            'email' => $user->email,
            'shares' => [
                'calories' => $user->share_calories,
                'steps' => $user->share_steps,
                'weight' => $user->share_weight,
                'workouts' => $user->share_workouts,
            ],
        ]);
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $data = $request->validated();
        $user = $request->user();

        // Mappatura esplicita: il corpo arriva in camelCase dall'app, le
        // colonne sono snake_case, e un fill() cieco accetterebbe qualunque
        // chiave passasse la validazione.
        $map = [
            'handle' => 'handle',
            'displayName' => 'display_name',
            'avatarUrl' => 'avatar_url',
            'bio' => 'bio',
            'shareCalories' => 'share_calories',
            'shareSteps' => 'share_steps',
            'shareWeight' => 'share_weight',
            'shareWorkouts' => 'share_workouts',
        ];
        foreach ($map as $input => $column) {
            if (array_key_exists($input, $data)) {
                $user->{$column} = $data[$input];
            }
        }
        $user->save();

        $this->forgetUnsharedStats($user);

        return $this->me($request);
    }

    /**
     * Cerca persone per handle o nome.
     *
     * Non elenca mai tutti: senza query non torna niente. Un elenco completo
     * degli iscritti non e' una funzione della ricerca amici.
     */
    public function search(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));
        if (mb_strlen($term) < 2) {
            return response()->json(['data' => []]);
        }

        $me = $request->user();
        $users = User::query()
            ->whereNotNull('handle')
            ->whereKeyNot($me->id)
            ->where(function ($q) use ($term) {
                $q->where('handle', 'like', "%{$term}%")
                    ->orWhere('display_name', 'like', "%{$term}%");
            })
            ->orderBy('handle')
            ->limit(20)
            ->get();

        return response()->json([
            'data' => $users
                ->map(fn (User $user) => [
                    'handle' => $user->handle,
                    'displayName' => $user->display_name ?? $user->name,
                    'avatarUrl' => $user->avatar_url,
                    'isFriend' => $me->isFriendWith($user),
                ])
                ->all(),
        ]);
    }

    /**
     * Il profilo di qualcun altro.
     *
     * Lo storico si carica SOLO per gli amici: caricarlo e poi azzerarlo nella
     * resource funzionerebbe, ma vorrebbe dire tirare fuori dal database dati
     * che chi guarda non ha diritto di vedere, e basterebbe una svista futura
     * perche' escano.
     */
    public function show(Request $request, string $handle): PublicProfileResource
    {
        $user = User::where('handle', $handle)->firstOrFail();
        $isFriend = $request->user()->isFriendWith($user);

        if ($isFriend) {
            $user->load(['sharedStats' => fn ($q) => $q
                ->where('date', '>=', now()->subDays(self::HISTORY_DAYS)->toDateString())
                ->orderByDesc('date')]);
        } else {
            $user->setRelation('sharedStats', collect());
        }

        return new PublicProfileResource($user, $isFriend);
    }

    /**
     * Spegnere una condivisione cancella quel che era gia' stato pubblicato.
     *
     * Senza, il server continuava a custodire mesi di calorie e di passi di
     * qualcuno che aveva appena detto di non volerli piu' condividere. Non
     * erano visibili - PublicProfileResource filtra in lettura, e i test lo
     * verificano - ma "nessuno li vede" e "non ci sono" non sono la stessa
     * cosa, e la seconda e' quella che l'utente ha chiesto.
     *
     * L'app da sola non bastava: quando le condivisioni sono tutte spente non
     * manda piu' niente, quindi non aveva nemmeno l'occasione di dire al
     * server di dimenticare. Qui invece l'informazione c'e' nel momento esatto
     * in cui la scelta viene fatta.
     *
     * Una riga rimasta senza piu' nessun dato viene tolta del tutto: un giorno
     * fatto di quattro null non e' una cosa che valga la pena conservare.
     */
    private function forgetUnsharedStats(User $user): void
    {
        $spente = array_keys(array_filter([
            'kcal' => ! $user->share_calories,
            'steps' => ! $user->share_steps,
            'weight_kg' => ! $user->share_weight,
            'workouts' => ! $user->share_workouts,
        ]));

        if ($spente === []) {
            return;
        }

        $user->sharedStats()->update(array_fill_keys($spente, null));

        $user->sharedStats()
            ->whereNull('kcal')
            ->whereNull('steps')
            ->whereNull('weight_kg')
            ->whereNull('workouts')
            ->delete();
    }
}
