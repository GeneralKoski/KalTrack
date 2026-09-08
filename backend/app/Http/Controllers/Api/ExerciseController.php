<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ExerciseController extends Controller
{
    /**
     * Quante voci per pagina.
     *
     * Il catalogo cresce con gli iscritti, quindi non esiste un numero che
     * basti per sempre: oltre questo si continua con `after`, e chi legge sa
     * che c'e' altro perche' la risposta glielo dice.
     */
    private const PER_PAGE = 200;

    /**
     * Il catalogo comune.
     *
     * Sotto `auth:sanctum` come tutto il resto: e' di tutti gli iscritti, non
     * del mondo. Chi non ha un account non vede niente di questa API, e il
     * catalogo non fa eccezione.
     */
    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $after = (string) $request->query('after', '');

        /*
         * Il cursore e' il nome normalizzato dell'ultima voce ricevuta, non un
         * numero di pagina: con un offset, una voce aggiunta mentre si scorre
         * fa slittare tutto e chi importa si perde una riga o la prende due
         * volte. `name_norm` e' unico, quindi "riprendi da dopo questo" e'
         * sempre lo stesso punto.
         */
        $exercises = Exercise::query()
            /*
             * Solo il catalogo, non le proposte.
             *
             * Nemmeno le proprie: chi ha proposto una voce ce l'ha gia' sul
             * telefono, e vedersela tornare dal catalogo comune vorrebbe dire
             * che e' stata pubblicata, che non e' vero.
             */
            ->where('status', 'published')
            ->when($term !== '', fn ($q) => $q->where('name_norm', 'LIKE', "%{$term}%"))
            ->when($after !== '', fn ($q) => $q->where('name_norm', '>', $after))
            ->orderBy('name_norm')
            ->limit(self::PER_PAGE)
            ->get();

        return response()->json([
            'data' => $exercises->map(
                fn (Exercise $e) => $this->publicShape($e, $request->user()->id)
            ),
            // Null quando la pagina non e' piena: non c'e' altro da chiedere.
            'next' => $exercises->count() === self::PER_PAGE
                ? $exercises->last()->name_norm
                : null,
        ]);
    }

    /**
     * Aggiunge una voce, se non c'e' gia'.
     *
     * Torna sempre la voce buona - quella nuova o quella che c'era gia' - e
     * mai un errore di duplicato: dal telefono questa chiamata parte quando
     * qualcuno crea un esercizio suo, e "esiste gia'" non e' un problema che
     * l'utente debba risolvere.
     *
     * Vince il nome scritto per primo. Le maiuscole si conservano, e' il
     * confronto a ignorarle: la stessa regola dei nomi utente.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        // Chi ha tolto questa voce dal catalogo lo ha fatto apposta: una
        // proposta con lo stesso nome non deve resuscitarla, la stessa regola
        // per cui `applyExerciseSeeds` sul telefono non resuscita mai un
        // esercizio cancellato. Nessuna perdita per chi propone: il suo
        // esercizio resta salvato sul telefono, che e' dove lo usa, e
        // `submitExerciseToCatalog` e' fire-and-forget - un 200 che non crea
        // nulla non cambia niente per lui.
        //
        // La risposta NON porta `publicShape($cancellata, ...)`: quella voce
        // ha un `muscleGroup`/`equipment` che chi chiama non ha mandato e non
        // puo' vedere, ed e' l'ombra di una riga cancellata - restituirla
        // trasformerebbe questo controllo in una sonda su cosa esiste nel
        // catalogo cancellato. Il 200 senza `data` basta a dire "non ho
        // creato nulla", che e' l'unica cosa che il chiamante (fire-and-forget)
        // deve sapere.
        $cancellata = Exercise::onlyTrashed()->where('name_norm', $norm)->first();
        if ($cancellata) {
            return response()->json(['ok' => true]);
        }

        $exercise = Exercise::firstOrCreate(
            ['name_norm' => $norm],
            [
                'uid' => (string) Str::uuid(),
                'name' => trim($validated['name']),
                'muscle_group' => $validated['muscleGroup'],
                'secondary_muscles' => $validated['secondaryMuscles'] ?? null,
                'equipment' => $validated['equipment'] ?? null,
                'created_by' => $request->user()->id,
                /*
                 * Fin qui una voce creata a mano entrava nell'elenco di
                 * chiunque, e la migrazione della tabella lo dichiarava. Da
                 * qui in poi si propone e basta: entra quando
                 * l'amministratore lo decide, dal gestionale.
                 */
                'status' => 'pending',
            ],
        );

        return response()->json([
            'data' => $this->publicShape($exercise, $request->user()->id),
        ]);
    }

    /**
     * Corregge una voce. SOLO LA PROPRIA.
     *
     * Il catalogo e' di tutti ma le voci hanno un autore, e senza questo
     * vincolo chiunque potrebbe riscrivere l'esercizio di chiunque altro
     * nell'app di tutti quanti.
     *
     * Una voce senza autore - vecchia, o di un account cancellato - non la
     * modifica piu' nessuno: resta in elenco cosi' com'e'.
     */
    public function update(Request $request, Exercise $exercise): JsonResponse
    {
        if ($negato = $this->soloLaPropriaProposta($request, $exercise)) {
            return $negato;
        }

        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        // Rinominando si potrebbe finire addosso a un'altra voce: il nome
        // normalizzato e' unico, e senza questo controllo il database
        // risponderebbe con un errore che l'utente non puo' interpretare.
        // `withTrashed()`: l'indice unico su `name_norm` copre anche le righe
        // cancellate, quindi non puo' fare finta di niente nemmeno questo
        // controllo - altrimenti il database lo tradirebbe con la stessa
        // eccezione non gestita che questo controllo esiste per evitare.
        //
        // Qui si rifiuta con 422 invece di tornare la voce cancellata come fa
        // `store()`: non e' un'incoerenza, sono due domande diverse. Una
        // proposta puo' diventare "prendi questa che gia' esiste"; una
        // correzione chiede di *diventare* quel nome, e quel nome e'
        // davvero occupato - anche se dall'ombra di una voce tolta.
        $altra = Exercise::withTrashed()
            ->where('name_norm', $norm)
            ->whereKeyNot($exercise->id)
            ->exists();
        if ($altra) {
            return response()->json([
                'message' => 'C\'e\' gia\' un esercizio con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        $exercise->update([
            'name' => trim($validated['name']),
            'name_norm' => $norm,
            'muscle_group' => $validated['muscleGroup'],
            'secondary_muscles' => $validated['secondaryMuscles'] ?? null,
            'equipment' => $validated['equipment'] ?? null,
        ]);

        return response()->json([
            'data' => $this->publicShape($exercise, $request->user()->id),
        ]);
    }

    /**
     * Toglie una voce dal catalogo. SOLO LA PROPRIA.
     *
     * Cancellazione morbida (`deleted_at`), non piu' vera. "Questa tabella non
     * si sincronizza con nessun telefono" era la premessa di quando bastava
     * essere un elenco che il server serve e basta: da quando esiste la
     * moderazione una voce tolta deve poter dire a un pannello di
     * amministrazione - e domani ai telefoni - che non c'e' piu', e una riga
     * sparita davvero non ha modo di raccontare nulla. Il telefono che
     * l'aveva importata se la tiene comunque: e' roba sua, ed e' quel che ci
     * si aspetta da un catalogo che si e' copiato in casa.
     */
    public function destroy(Request $request, Exercise $exercise): JsonResponse
    {
        if ($negato = $this->soloLaPropriaProposta($request, $exercise)) {
            return $negato;
        }

        $exercise->delete();

        return response()->json(['ok' => true]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'muscleGroup' => ['required', 'string', 'max:40'],
            // Elenchi separati da virgole, come in colonna.
            'secondaryMuscles' => ['sometimes', 'nullable', 'string', 'max:200'],
            'equipment' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }

    private function nomeVuoto(): JsonResponse
    {
        return response()->json([
            'message' => 'Il nome dell\'esercizio non puo\' essere vuoto.',
            'errors' => ['name' => ['Il nome non puo\' essere vuoto.']],
        ], 422);
    }

    /**
     * Il controllo di proprieta', in un posto solo.
     *
     * Torna la risposta di rifiuto, o null se si puo' procedere.
     *
     * Due condizioni e non una: la voce dev'essere di chi chiede E dev'essere
     * ancora in attesa. Da pubblicata in poi non e' piu' sua - e' nell'app di
     * tutti - e correggerla la cambierebbe a chiunque. La sua copia ce l'ha
     * comunque sul telefono, dove nessuno gliela tocca.
     *
     * La stessa risposta per tutti i casi: distinguere "non e' tua" da "e'
     * gia' pubblicata" direbbe a chi prova qualcosa che non gli riguarda.
     */
    private function soloLaPropriaProposta(Request $request, Exercise $exercise): ?JsonResponse
    {
        $mia = $exercise->created_by !== null
            && $exercise->created_by === $request->user()->id;

        if ($mia && $exercise->status === 'pending') {
            return null;
        }

        return response()->json([
            'message' => 'Puoi modificare solo le proposte che hai fatto tu e che non sono ancora state pubblicate.',
        ], 403);
    }

    /**
     * Cosa esce di una voce di catalogo.
     *
     * L'elenco delle chiavi e' il confine. `created_by` NON C'E' e non deve
     * comparirci: al suo posto esce `mine`, che dice a chi guarda se puo'
     * correggerla senza dire a nessuno chi l'ha scritta.
     *
     * `created_at` resta dentro: incrociata con quando qualcuno si e'
     * allenato, direbbe piu' di quanto un catalogo debba dire.
     */
    private function publicShape(Exercise $exercise, int $chiGuarda): array
    {
        return [
            /*
             * L'identita' stabile, ed e' quella che il telefono salva in
             * colonna: `id` e' un autoincrement di QUESTO server, mentre
             * `uid` e' una stringa assegnata alla voce e uguale per chiunque.
             * Entrambi escono perche' entrambi indirizzano una scrittura: le
             * rotte `catalog/*` per uid, quelle vecchie per id.
             */
            'uid' => $exercise->uid,
            'id' => $exercise->id,
            'name' => $exercise->name,
            'nameNorm' => $exercise->name_norm,
            'muscleGroup' => $exercise->muscle_group,
            'secondaryMuscles' => $exercise->secondary_muscles,
            'equipment' => $exercise->equipment,
            'mine' => $exercise->created_by !== null
                && $exercise->created_by === $chiGuarda,
        ];
    }
}
