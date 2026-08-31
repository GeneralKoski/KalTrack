<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ComparisonParticipantResource;
use App\Models\SharedStat;
use App\Models\SharedWorkout;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class ComparisonController extends Controller
{
    /**
     * Quante persone si possono mettere accanto.
     *
     * Quattro piu' se stessi. Non e' una limitazione tecnica: cinque colonne
     * di numeri sono gia' il massimo che si legga su un telefono, e il limite
     * imposto qui e' quello che la schermata spiega invece di subire.
     */
    private const MAX_HANDLE = 4;

    /**
     * I numeri di piu' persone, in una chiamata sola.
     *
     * Non torna i propri: quelli il telefono li ha gia', ed e' lui la fonte di
     * verita'. Chiederli al server vorrebbe dire mostrare all'utente la
     * **copia** dei suoi dati invece dei suoi dati, e le due cose divergono
     * ogni volta che si e' scritto qualcosa senza rete.
     *
     * Le due regole della privacy si applicano per ciascuno dentro
     * `ComparisonParticipantResource`: chi non e' amico esce senza numeri, e
     * non fa fallire la richiesta degli altri.
     */
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'handles' => ['required', 'string', 'max:200'],
            'date' => ['sometimes', 'date_format:Y-m-d'],
            // Un giorno solo di default: il confronto nasce come "oggi", e il
            // periodo e' una domanda che si fa apposta.
            'days' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ]);

        $me = $request->user();
        $date = $validated['date'] ?? now()->toDateString();
        // Dalla query string arriva una stringa: senza il cast, `days` esce
        // come "7" e chi legge la risposta deve indovinare il tipo.
        $days = (int) ($validated['days'] ?? 1);

        $handles = collect(explode(',', $validated['handles']))
            ->map(fn (string $h) => trim($h))
            ->filter()
            // Confrontarsi con se stessi non e' una domanda: la colonna "tu"
            // c'e' gia', e comparire due volte sarebbe solo confusione.
            ->reject(fn (string $h) => mb_strtolower($h) === mb_strtolower((string) $me->handle))
            ->unique(fn (string $h) => mb_strtolower($h))
            ->values();

        if ($handles->count() > self::MAX_HANDLE) {
            return response()->json([
                'message' => 'Si possono confrontare al massimo '.self::MAX_HANDLE.' persone.',
                'errors' => ['handles' => ['Al massimo '.self::MAX_HANDLE.' persone.']],
            ], 422);
        }

        /*
         * Un handle che non esiste viene ignorato e non fa fallire niente. Non
         * e' indulgenza: l'app sceglie gli amici da un elenco che ha gia', e un
         * errore qui vorrebbe dire che un account cancellato blocca il
         * confronto di chi lo aveva in lista.
         */
        $utenti = $handles
            ->map(fn (string $handle) => User::whereHandle($handle)->first())
            ->filter()
            ->values();

        return response()->json([
            'date' => $date,
            'days' => $days,
            'participants' => $utenti
                ->map(fn (User $user) => (new ComparisonParticipantResource(
                    $user,
                    $me->isFriendWith($user),
                    $this->totali($user, $date, $days),
                    $this->esercizi($user, $date, $days),
                ))->toArray($request))
                ->values(),
        ]);
    }

    /**
     * Il primo giorno del periodo chiesto.
     *
     * Non c'e' piu' un tetto per persona: si pubblica tutto lo storico, quindi
     * il periodo lo sceglie chi guarda. Quel che si vede resta comunque solo
     * cio' che i cinque interruttori fanno uscire, e solo fra amici.
     */
    private function primoGiorno(User $user, string $date, int $days): string
    {
        return Carbon::parse($date)->subDays($days - 1)->toDateString();
    }

    /**
     * I totali del periodo.
     *
     * Passi e allenamenti si SOMMANO, le calorie si fanno in MEDIA sui giorni
     * registrati. Non e' un dettaglio: la somma settimanale delle calorie di
     * due persone che hanno registrato giorni diversi confronterebbe chi ha
     * scritto di piu', non chi ha mangiato di piu'. E la media va fatta sui
     * giorni che ci sono, non sui sette del periodo, altrimenti chi ha
     * segnato due giorni risulterebbe mangiare seicento calorie al giorno.
     *
     * Su un giorno solo somma e media coincidono, quindi non c'e' un ramo a
     * parte da mantenere.
     */
    private function totali(User $user, string $date, int $days): ?object
    {
        $righe = SharedStat::where('user_id', $user->id)
            ->whereBetween('date', [$this->primoGiorno($user, $date, $days), $date])
            ->get();

        if ($righe->isEmpty()) {
            return null;
        }

        $conCalorie = $righe->whereNotNull('kcal');

        return (object) [
            'kcal' => $conCalorie->isEmpty()
                ? null
                : (int) round($conCalorie->avg('kcal')),
            // `null` e non zero quando nessuno dei giorni ha un numero: "non
            // registrato" resta distinguibile da "zero passi".
            'steps' => $righe->whereNotNull('steps')->isEmpty()
                ? null
                : (int) $righe->sum('steps'),
            'workouts' => $righe->whereNotNull('workouts')->isEmpty()
                ? null
                : (int) $righe->sum('workouts'),
        ];
    }

    /**
     * Gli esercizi del periodo, sommati per esercizio.
     *
     * Serie, ripetizioni e volume si sommano; il carico massimo e' il massimo,
     * non la somma - sommare i massimali direbbe che ha alzato il doppio di
     * quel che ha alzato.
     *
     * @return Collection<int, object>
     */
    private function esercizi(User $user, string $date, int $days): Collection
    {
        return SharedWorkout::where('user_id', $user->id)
            ->whereBetween('date', [$this->primoGiorno($user, $date, $days), $date])
            ->orderBy('id')
            ->get()
            ->groupBy('exercise_name')
            ->map(fn (Collection $righe, string $name) => (object) [
                'name' => $name,
                'sets' => (int) $righe->sum('sets'),
                'totalReps' => (int) $righe->sum('total_reps'),
                'volumeKg' => (float) $righe->sum('volume_kg'),
                'topWeightKg' => $righe->whereNotNull('top_weight_kg')->isEmpty()
                    ? null
                    : (float) $righe->max('top_weight_kg'),
            ])
            ->values();
    }
}
