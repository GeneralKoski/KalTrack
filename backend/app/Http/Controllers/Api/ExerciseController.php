<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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

        $exercise = Exercise::firstOrCreate(
            ['name_norm' => $norm],
            [
                'name' => trim($validated['name']),
                'muscle_group' => $validated['muscleGroup'],
                'secondary_muscles' => $validated['secondaryMuscles'] ?? null,
                'equipment' => $validated['equipment'] ?? null,
                'created_by' => $request->user()->id,
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
        if ($negato = $this->soloIlProprietario($request, $exercise->created_by)) {
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
        $altra = Exercise::where('name_norm', $norm)
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
     * Cancellazione vera e non `deleted_at`: questa tabella non si sincronizza
     * con nessun telefono - e' un elenco che il server serve e basta - quindi
     * non esiste il difetto per cui una riga tolta risorge al giro dopo. Il
     * telefono che l'aveva importata se la tiene: e' roba sua, ed e' quel che
     * ci si aspetta da un catalogo che si e' copiato in casa.
     */
    public function destroy(Request $request, Exercise $exercise): JsonResponse
    {
        if ($negato = $this->soloIlProprietario($request, $exercise->created_by)) {
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
     * Torna la risposta di rifiuto, o null se si puo' procedere. La stessa
     * risposta per "non e' tua" e per "non ha un proprietario": in entrambi i
     * casi la voce non e' modificabile da chi sta chiedendo, e distinguere i
     * due direbbe a chi prova che quella voce ha un autore.
     */
    private function soloIlProprietario(Request $request, ?int $autore): ?JsonResponse
    {
        if ($autore !== null && $autore === $request->user()->id) {
            return null;
        }

        return response()->json([
            'message' => 'Puoi modificare solo le voci che hai aggiunto tu.',
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
            // L'id serve al telefono per chiedere una modifica o una
            // cancellazione: senza, "questa e' mia" non sarebbe azionabile.
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
