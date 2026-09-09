<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Una voce del catalogo comune.
 *
 * `created_by` c'e' ma non esce mai verso un utente normale: serve a decidere
 * chi puo' correggere una voce, e all'amministratore per sapere chi ha
 * proposto cosa in revisione. Le rotte `/api/catalog/*` non lo espongono, le
 * rotte `/api/admin/*` si'.
 */
#[Fillable([
    'uid',
    'name',
    'name_norm',
    'muscle_group',
    'secondary_muscles',
    'equipment',
    'status',
    'instructions',
    'photo',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'created_by',
])]
class Exercise extends Model
{
    use SoftDeletes;

    /** Gli stati della moderazione. Sta qui perche' li leggono in tre. */
    public const STATUSES = ['pending', 'published', 'rejected'];

    /**
     * Quanto puo' essere lungo un elenco di slug separati da virgole
     * (`secondary_muscles`, `equipment`).
     *
     * ERA 200 E 120, DIMENSIONATI SU UN INSIEME CHIUSO CHE NON ESISTE PIU'.
     * Quelle due misure venivano da quando gruppi muscolari e attrezzi erano
     * due union TypeScript: undici slug di attrezzatura uniti fanno 89
     * caratteri, sotto i 120, e la cosa tornava **per fortuna e non per
     * costruzione**. Da quando la tassonomia e' una tabella che un
     * amministratore riempie senza un rilascio dell'app, un esercizio che
     * nomina qualche attrezzo in piu' supera il tetto: il telefono si prende
     * un 422, `submitExerciseToCatalog` lo annota e va avanti - l'esercizio
     * resta salvato sul telefono e **non viene mai proposto al catalogo**, per
     * un'aritmetica che nessuno guarda.
     *
     * Mille non e' un numero scelto a occhio: uno slug e' al massimo 40
     * caratteri (`muscle_groups.slug` ed `equipment_types.slug` sono
     * `string(40)`), quindi mille caratteri tengono **ventiquattro slug alla
     * lunghezza massima** - o un centinaio di quelli del seme, che sono corti.
     * Un esercizio che nomina ventiquattro gruppi muscolari diversi non
     * esiste.
     *
     * **E' UNA COSTANTE E NON UNA MIGRAZIONE, e l'ho verificato invece di
     * assumerlo.** Il tetto non e' mai stato del database: la grammatica
     * SQLite di Laravel emette `varchar` **senza lunghezza** - il
     * `CREATE TABLE` di `exercises` dice `"equipment" varchar` e nient'altro -
     * e una scrittura di 5.000 caratteri entra e torna intera. Il 422 lo
     * dava la validazione e solo lei, quindi qui c'e' tutto quel che c'era da
     * alzare; una migrazione avrebbe ricostruito la tabella del catalogo per
     * emettere lo stesso DDL identico. Chi un giorno portasse questo server
     * su un driver che le lunghezze le applica davvero (MySQL, Postgres) ha
     * queste due colonne da dimensionare **su questa costante** nella
     * migrazione di quel passaggio.
     *
     * Un tetto resta comunque, ed e' voluto: sono elenchi di slug, non testo
     * libero, e un campo senza limite e' un campo che qualcuno prima o poi
     * usa per altro. Le tre porte di scrittura - il telefono
     * (`ExerciseController::rules`), il pannello (`AdminExerciseRequest`) e
     * la coda di revisione (`ReviewSubmissionRequest`) - leggono tutte questa
     * costante: se una validasse piu' stretto delle altre, una proposta
     * arrivata legittimamente non si potrebbe approvare.
     */
    public const MAX_SLUG_LIST = 1000;

    protected function casts(): array
    {
        return ['reviewed_at' => 'datetime'];
    }

    /**
     * Chi ha proposto la voce.
     *
     * ESCE SOLO DALLE ROTTE `/api/admin/*`. Verso un utente normale il
     * catalogo continua a non dire di chi e' una voce, e la migrazione della
     * tabella spiega perche': sapere che un esercizio l'ha inventato Tizio e'
     * un fatto su Tizio, e non serve a nessuno per allenarsi.
     */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
