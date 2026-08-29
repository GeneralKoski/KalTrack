<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SyncRequest;
use App\Models\SyncRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * La sincronizzazione: una sola andata e ritorno per push e pull.
 *
 * Il telefono resta la fonte di verita' e continua a funzionare offline. Il
 * server tiene una copia, cosi' un secondo dispositivo la ritrova e un
 * telefono perso non porta via tutto.
 *
 * Push e pull nella stessa chiamata perche' sono la stessa conversazione:
 * separarli vorrebbe dire due viaggi di rete e una finestra in mezzo in cui il
 * segnaposto di ripartenza non corrisponde a quel che si e' appena mandato.
 */
class SyncController extends Controller
{
    /** Quante righe tornano al massimo in una pull. Oltre, il client richiama. */
    private const PULL_LIMIT = 2000;

    public function sync(SyncRequest $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validated();
        $since = isset($data['since']) ? Carbon::parse($data['since']) : null;

        $applied = $this->push($user->id, $data['changes']);

        // La pull legge DOPO la push, nella stessa richiesta: quel che il
        // telefono ha appena mandato non gli torna indietro, perche' e' gia'
        // suo e riconoscerlo costerebbe un confronto riga per riga.
        [$changes, $cursor] = $this->pull($user->id, $since, $data['changes']);

        return response()->json([
            'applied' => $applied,
            'changes' => $changes,
            // Il segnaposto da rimandare la prossima volta. E' l'ora del
            // SERVER: quella del telefono puo' essere sbagliata, e basterebbe
            // un orologio indietro di un minuto per non ricevere piu' niente.
            'cursor' => $cursor->toIso8601String(),
        ]);
    }

    /**
     * Scrive quel che arriva dal telefono.
     *
     * Chi ha scritto per ultimo vince, e "ultimo" si misura sull'ora del
     * dispositivo. Con un solo utente su piu' dispositivi i conflitti veri
     * sono rari, e una regola semplice che si puo' spiegare vale piu' di una
     * fusione automatica che nessuno sa prevedere.
     */
    private function push(int $userId, array $changes): int
    {
        if ($changes === []) {
            return 0;
        }

        $applied = 0;

        DB::transaction(function () use ($userId, $changes, &$applied) {
            foreach ($changes as $change) {
                $incoming = Carbon::parse($change['updatedAt']);

                $existing = SyncRecord::query()
                    ->where('user_id', $userId)
                    ->where('table_name', $change['table'])
                    ->where('record_id', $change['id'])
                    ->first();

                // Piu' vecchia di quel che c'e': si scarta senza rumore. E'
                // il caso normale di un dispositivo che rimanda righe gia'
                // note, non un errore da segnalare.
                if ($existing !== null && $existing->updated_at >= $incoming) {
                    continue;
                }

                SyncRecord::updateOrCreate(
                    [
                        'user_id' => $userId,
                        'table_name' => $change['table'],
                        'record_id' => $change['id'],
                    ],
                    [
                        'payload' => $change['payload'],
                        'updated_at' => $incoming,
                        'deleted_at' => isset($change['deletedAt'])
                            ? Carbon::parse($change['deletedAt'])
                            : null,
                        'created_at' => Carbon::parse($change['createdAt']),
                        'synced_at' => now(),
                    ]
                );
                $applied++;
            }
        });

        return $applied;
    }

    /**
     * Restituisce quel che e' cambiato dopo `since`.
     *
     * Si filtra su `synced_at`, l'ora in cui il server ha ricevuto la riga, e
     * non su `updated_at`: un dispositivo con l'orologio indietro
     * scriverebbe righe con una data passata, che con un filtro su
     * `updated_at` nessun altro vedrebbe mai piu'.
     *
     * @return array{0: array<int, array<string, mixed>>, 1: Carbon}
     */
    private function pull(int $userId, ?Carbon $since, array $justPushed): array
    {
        $query = SyncRecord::query()
            ->where('user_id', $userId)
            ->orderBy('synced_at')
            ->limit(self::PULL_LIMIT);

        if ($since !== null) {
            $query->where('synced_at', '>', $since);
        }

        $records = $query->get();

        // Le righe appena arrivate da questo telefono non gli tornano
        // indietro: le ha gia'.
        $mine = collect($justPushed)
            ->map(fn (array $c) => $c['table'].':'.$c['id'])
            ->flip();

        $changes = $records
            ->reject(fn (SyncRecord $r) => $mine->has($r->table_name.':'.$r->record_id))
            ->map(fn (SyncRecord $r) => [
                'table' => $r->table_name,
                'id' => $r->record_id,
                'payload' => $r->payload,
                'updatedAt' => $r->updated_at->toIso8601String(),
                'deletedAt' => $r->deleted_at?->toIso8601String(),
                'createdAt' => $r->created_at->toIso8601String(),
            ])
            ->values()
            ->all();

        // Il segnaposto e' l'ultima riga LETTA, non l'ora corrente: se la
        // pagina era piena, la prossima chiamata riparte da li' invece di
        // saltare quel che non ci stava.
        $cursor = $records->count() === self::PULL_LIMIT && $records->isNotEmpty()
            ? $records->last()->synced_at
            : now();

        return [$changes, $cursor];
    }
}
