<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SyncStatsRequest;
use App\Models\SharedStat;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SharedStatController extends Controller
{
    /**
     * Il telefono pubblica i suoi totali di giornata.
     *
     * Sostituisce, non somma: il telefono e' la fonte di verita' e il server
     * ne tiene una copia. Un upsert per giorno, in transazione, cosi' una
     * sincronizzazione interrotta non lascia meta' settimana aggiornata.
     *
     * Un campo che l'utente non condivide non viene nemmeno mandato dall'app,
     * e qui resta null: il server non deve custodire dati che nessuno vedra'.
     */
    public function sync(SyncStatsRequest $request): JsonResponse
    {
        $userId = $request->user()->id;
        $days = $request->validated()['days'];

        DB::transaction(function () use ($userId, $days) {
            foreach ($days as $day) {
                SharedStat::updateOrCreate(
                    ['user_id' => $userId, 'date' => $day['date']],
                    [
                        'kcal' => $day['kcal'] ?? null,
                        'steps' => $day['steps'] ?? null,
                        'weight_kg' => $day['weightKg'] ?? null,
                        'workouts' => $day['workouts'] ?? null,
                    ]
                );
            }
        });

        return response()->json(['synced' => count($days)]);
    }
}
