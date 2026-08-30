<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SyncWorkoutsRequest;
use App\Models\SharedWorkout;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class SharedWorkoutController extends Controller
{
    /**
     * Il telefono pubblica quel che ha fatto in palestra.
     *
     * Sostituisce un giorno per volta: le righe di quel giorno vengono tolte e
     * riscritte. Non e' pigrizia rispetto a un upsert - un esercizio tolto
     * dalla sessione sul telefono deve sparire anche qui, e un upsert lo
     * lascerebbe in piedi per sempre.
     *
     * Due controlli che l'app fa gia' e che qui si rifanno lo stesso, perche'
     * questo e' l'unico endpoint che pubblica CONTENUTO e non un totale: che
     * l'interruttore sia acceso, e che i giorni stiano nella finestra scelta.
     * Se l'unica difesa fosse sul telefono, basterebbe un difetto del telefono.
     */
    public function sync(SyncWorkoutsRequest $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->share_gym) {
            return response()->json([
                'message' => 'La condivisione della palestra e\' spenta.',
            ], 403);
        }

        $primoGiorno = Carbon::today()
            ->subDays($user->finestraInGiorni() - 1)
            ->toDateString();

        $days = collect($request->validated()['days'])
            ->filter(fn (array $day) => $day['date'] >= $primoGiorno);

        $scritti = 0;

        DB::transaction(function () use ($user, $days, &$scritti) {
            foreach ($days as $day) {
                SharedWorkout::where('user_id', $user->id)
                    ->where('date', $day['date'])
                    ->delete();

                foreach ($day['exercises'] as $exercise) {
                    SharedWorkout::create([
                        'user_id' => $user->id,
                        'date' => $day['date'],
                        'exercise_name' => $exercise['name'],
                        'sets' => $exercise['sets'],
                        'total_reps' => $exercise['totalReps'],
                        'volume_kg' => $exercise['volumeKg'],
                        'top_weight_kg' => $exercise['topWeightKg'] ?? null,
                    ]);
                    $scritti++;
                }
            }
        });

        return response()->json(['synced' => $scritti]);
    }
}
