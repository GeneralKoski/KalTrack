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
        // Il segnaposto e' un numero, non un'ora: vedi `sequence`.
        $since = (int) ($data['since'] ?? 0);

        [$applied, $accepted] = $this->push($user->id, $data['changes']);

        // La pull legge DOPO la push, nella stessa richiesta.
        [$changes, $cursor] = $this->pull($user->id, $since, $accepted);

        return response()->json([
            'applied' => $applied,
            'changes' => $changes,
            'cursor' => (string) $cursor,
        ]);
    }

    /**
     * Scrive quel che arriva dal telefono.
     *
     * Chi ha scritto per ultimo vince, e "ultimo" si misura sull'ora del
     * dispositivo. Con un solo utente su piu' dispositivi i conflitti veri
     * sono rari, e una regola semplice che si puo' spiegare vale piu' di una
     * fusione automatica che nessuno sa prevedere.
     *
     * Torna anche l'elenco di cio' che e' stato DAVVERO accettato: la pull ne
     * ha bisogno per sapere cosa non rimandare indietro. Sopprimere l'intero
     * lotto inviato nascondeva al telefono la copia piu' recente delle righe
     * che aveva perso il confronto, e quelle divergevano per sempre.
     *
     * @return array{0: int, 1: array<int, string>}
     */
    private function push(int $userId, array $changes): array
    {
        if ($changes === []) {
            return [0, []];
        }

        $applied = 0;
        $accepted = [];

        DB::transaction(function () use ($userId, $changes, &$applied, &$accepted) {
            /*
             * Il prossimo numero della sequenza, preso una volta e fatto
             * avanzare in memoria.
             *
             * Dentro la transazione: due sincronizzazioni contemporanee dello
             * stesso utente si serializzano, e nessuna delle due puo' leggere
             * un massimo gia' vecchio.
             */
            $next = (int) SyncRecord::where('user_id', $userId)->max('sequence') + 1;

            foreach ($changes as $change) {
                $incoming = Carbon::parse($change['updatedAt']);

                $existing = SyncRecord::query()
                    ->where('user_id', $userId)
                    ->where('table_name', $change['table'])
                    ->where('record_id', $change['id'])
                    ->first();

                // Piu' vecchia di quel che c'e': si scarta senza rumore, e
                // NON si conta fra le accettate, cosi' la pull rimandera'
                // indietro la versione buona.
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
                        // Un numero nuovo anche sugli aggiornamenti: e' cosi'
                        // che una riga modificata torna visibile agli altri
                        // dispositivi.
                        'sequence' => $next++,
                    ]
                );
                $applied++;
                $accepted[] = $change['table'].':'.$change['id'];
            }
        });

        return [$applied, $accepted];
    }

    /**
     * Restituisce quel che e' cambiato dopo `since`.
     *
     * Il segnaposto e' un CONTATORE, non un'ora. Con `synced_at` due
     * dispositivi che sincronizzavano nello stesso secondo si perdevano le
     * righe a vicenda: la colonna ha precisione al secondo e il cursore
     * veniva serializzato senza sub-secondi, quindi il secondo dispositivo
     * chiedeva "dopo le 12:00:00" e le righe scritte alle 12:00:00.400 non
     * comparivano mai piu'.
     *
     * @param  array<int, string>  $accepted  Solo cio' che la push ha davvero scritto.
     * @return array{0: array<int, array<string, mixed>>, 1: int}
     */
    private function pull(int $userId, int $since, array $accepted): array
    {
        $records = SyncRecord::query()
            ->where('user_id', $userId)
            ->where('sequence', '>', $since)
            ->orderBy('sequence')
            ->limit(self::PULL_LIMIT)
            ->get();

        $mine = collect($accepted)->flip();

        $changes = $records
            ->reject(fn (SyncRecord $r) => $mine->has($r->table_name.':'.$r->record_id))
            ->map(fn (SyncRecord $r) => [
                'table' => $r->table_name,
                'id' => $r->record_id,
                'payload' => $r->payload,
                'updatedAt' => self::instant($r->updated_at),
                'deletedAt' => $r->deleted_at !== null ? self::instant($r->deleted_at) : null,
                'createdAt' => self::instant($r->created_at),
            ])
            ->values()
            ->all();

        /*
         * Il segnaposto e' l'ultima riga LETTA, non il massimo assoluto: se la
         * pagina era piena, la prossima chiamata riparte esattamente da li'.
         * Con un contatore non esistono pareggi, quindi nessuna riga puo'
         * cadere fra una pagina e l'altra.
         */
        $cursor = $records->isNotEmpty() ? $records->last()->sequence : $since;

        return [$changes, $cursor];
    }

    /**
     * Un istante scritto con i millesimi.
     *
     * `toIso8601String()` li lascia fuori. Il telefono decide chi vince un
     * conflitto su queste ore, e una busta arrotondata al secondo rende
     * indistinguibili due scritture dello stesso secondo. Il payload i
     * millesimi ce li ha sempre - e' il testo scritto dal telefono d'origine -
     * quindi il difetto restava nascosto finche' qualcuno non si fidava della
     * busta.
     */
    private static function instant(Carbon $moment): string
    {
        return $moment->format('Y-m-d\TH:i:s.vP');
    }
}
