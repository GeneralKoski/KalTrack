<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Food;
use App\Support\Text;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Il catalogo degli alimenti, comune a tutti gli iscritti.
 *
 * Gemello di `ExerciseController` e con le stesse regole: deduplica sul nome
 * normalizzato, l'autore si registra ma non esce, e ciascuno corregge o toglie
 * solo le voci che ha aggiunto lui.
 *
 * I valori sono PER 100 g / 100 ml, come sul telefono.
 */
class FoodController extends Controller
{
    /** Quante voci per pagina. Oltre, si continua con `after`. */
    private const PER_PAGE = 200;

    public function index(Request $request): JsonResponse
    {
        $term = Text::normalize((string) $request->query('q', ''));
        $after = (string) $request->query('after', '');

        // Cursore sul nome normalizzato e non un offset: con un offset, una
        // voce aggiunta mentre si scorre fa slittare tutto e chi importa si
        // perde una riga o la prende due volte.
        $foods = Food::query()
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
            'data' => $foods->map(
                fn (Food $f) => $this->publicShape($f, $request->user()->id)
            ),
            'next' => $foods->count() === self::PER_PAGE
                ? $foods->last()->name_norm
                : null,
        ]);
    }

    /**
     * Aggiunge una voce, se non c'e' gia'.
     *
     * Come per gli esercizi, un nome gia' in catalogo non e' un errore: torna
     * la voce che c'era. Dal telefono questa parte quando qualcuno salva un
     * alimento suo, e non deve trasformarsi in un problema da risolvere.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        // Chi ha tolto questo alimento dal catalogo lo ha fatto apposta: una
        // proposta con lo stesso nome non deve resuscitarlo, la stessa regola
        // per cui l'archivio sul telefono non resuscita mai un alimento
        // cancellato. Nessuna perdita per chi propone: l'alimento resta
        // salvato sul telefono, che e' dove lo usa, e `submitFoodToCatalog` e'
        // fire-and-forget - un 200 che non crea nulla non cambia niente per
        // lui.
        //
        // La risposta NON porta `publicShape($cancellato, ...)`: quella voce
        // ha un intero blocco nutrizionale che chi chiama non ha mandato e
        // non puo' vedere, ed e' l'ombra di una riga cancellata - restituirla
        // trasformerebbe questo controllo in una sonda su cosa esiste nel
        // catalogo cancellato. Il 200 senza `data` basta a dire "non ho
        // creato nulla", che e' l'unica cosa che il chiamante (fire-and-forget)
        // deve sapere.
        $cancellato = Food::onlyTrashed()->where('name_norm', $norm)->first();
        if ($cancellato) {
            return response()->json(['ok' => true]);
        }

        $food = Food::firstOrCreate(
            ['name_norm' => $norm],
            [
                ...$this->colonne($validated),
                'uid' => (string) Str::uuid(),
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
            'data' => $this->publicShape($food, $request->user()->id),
        ]);
    }

    /** Corregge una voce. SOLO LA PROPRIA. */
    public function update(Request $request, Food $food): JsonResponse
    {
        if ($negato = $this->soloLaPropriaProposta($request, $food)) {
            return $negato;
        }

        $validated = $request->validate($this->rules());

        $norm = Text::normalize($validated['name']);
        if ($norm === '') {
            return $this->nomeVuoto();
        }

        // Rinominando si potrebbe finire addosso a un altro alimento: il nome
        // normalizzato e' unico, e senza questo controllo il database
        // risponderebbe con un errore che l'utente non puo' interpretare.
        // `withTrashed()`: l'indice unico su `name_norm` copre anche le righe
        // cancellate, quindi non puo' fare finta di niente nemmeno questo
        // controllo - altrimenti il database lo tradirebbe con la stessa
        // eccezione non gestita che questo controllo esiste per evitare.
        //
        // Qui si rifiuta con 422 invece di tornare l'alimento cancellato come
        // fa `store()`: non e' un'incoerenza, sono due domande diverse. Una
        // proposta puo' diventare "prendi questo che gia' esiste"; una
        // correzione chiede di *diventare* quel nome, e quel nome e' davvero
        // occupato - anche se dall'ombra di un alimento tolto.
        $altra = Food::withTrashed()
            ->where('name_norm', $norm)
            ->whereKeyNot($food->id)
            ->exists();
        if ($altra) {
            return response()->json([
                'message' => 'C\'e\' gia\' un alimento con questo nome.',
                'errors' => ['name' => ['Nome gia\' in catalogo.']],
            ], 422);
        }

        $food->update([...$this->colonne($validated), 'name_norm' => $norm]);

        return response()->json([
            'data' => $this->publicShape($food, $request->user()->id),
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
     * sparita davvero non ha modo di raccontare nulla. Chi l'aveva gia'
     * importata se la tiene comunque: e' roba sua, ed e' quel che ci si
     * aspetta da un catalogo che si e' copiato in casa.
     */
    public function destroy(Request $request, Food $food): JsonResponse
    {
        if ($negato = $this->soloLaPropriaProposta($request, $food)) {
            return $negato;
        }

        $food->delete();

        return response()->json(['ok' => true]);
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:60'],
            // Per 100 g: i due tetti sono su `Food` e non qui, perche'
            // `AdminFoodRequest` e `ReviewSubmissionRequest` validano le
            // stesse otto colonne e devono usare gli stessi numeri - vedi il
            // commento li'.
            'kcal' => ['required', 'numeric', 'min:0', 'max:'.Food::MAX_KCAL],
            'protein' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'carbs' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'sugars' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'fat' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'saturatedFat' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'fiber' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'salt' => ['sometimes', 'numeric', 'min:0', 'max:'.Food::MAX_NUTRIENT_GRAMS],
            'isLiquid' => ['sometimes', 'boolean'],
            'defaultServingG' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:5000'],
            'servingLabel' => ['sometimes', 'nullable', 'string', 'max:40'],
        ];
    }

    /**
     * Dal corpo camelCase alle colonne snake_case.
     *
     * Mappatura esplicita e non un `fill()` cieco: quest'ultimo accetterebbe
     * qualunque chiave passasse la validazione, `created_by` compreso.
     */
    private function colonne(array $validated): array
    {
        return [
            'name' => trim($validated['name']),
            'name_norm' => Text::normalize($validated['name']),
            'brand' => $validated['brand'] ?? null,
            'kcal' => $validated['kcal'],
            'protein' => $validated['protein'] ?? 0,
            'carbs' => $validated['carbs'] ?? 0,
            'sugars' => $validated['sugars'] ?? 0,
            'fat' => $validated['fat'] ?? 0,
            'saturated_fat' => $validated['saturatedFat'] ?? 0,
            'fiber' => $validated['fiber'] ?? 0,
            'salt' => $validated['salt'] ?? 0,
            'is_liquid' => $validated['isLiquid'] ?? false,
            'default_serving_g' => $validated['defaultServingG'] ?? null,
            'serving_label' => $validated['servingLabel'] ?? null,
        ];
    }

    private function nomeVuoto(): JsonResponse
    {
        return response()->json([
            'message' => 'Il nome dell\'alimento non puo\' essere vuoto.',
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
    private function soloLaPropriaProposta(Request $request, Food $food): ?JsonResponse
    {
        $mia = $food->created_by !== null
            && $food->created_by === $request->user()->id;

        if ($mia && $food->status === 'pending') {
            return null;
        }

        return response()->json([
            'message' => 'Puoi modificare solo le proposte che hai fatto tu e che non sono ancora state pubblicate.',
        ], 403);
    }

    /**
     * Cosa esce di una voce di catalogo.
     *
     * `created_by` NON C'E': al suo posto esce `mine`, che dice a chi guarda se
     * puo' correggerla senza dire a nessuno chi l'ha scritta.
     */
    private function publicShape(Food $food, int $chiGuarda): array
    {
        return [
            // Vedi ExerciseController::publicShape.
            'uid' => $food->uid,
            'id' => $food->id,
            'name' => $food->name,
            'nameNorm' => $food->name_norm,
            'brand' => $food->brand,
            'kcal' => $food->kcal,
            'protein' => $food->protein,
            'carbs' => $food->carbs,
            'sugars' => $food->sugars,
            'fat' => $food->fat,
            'saturatedFat' => $food->saturated_fat,
            'fiber' => $food->fiber,
            'salt' => $food->salt,
            'isLiquid' => $food->is_liquid,
            'defaultServingG' => $food->default_serving_g,
            'servingLabel' => $food->serving_label,
            'mine' => $food->created_by !== null
                && $food->created_by === $chiGuarda,
        ];
    }
}
