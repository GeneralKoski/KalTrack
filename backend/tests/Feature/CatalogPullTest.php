<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\MuscleGroup;
use App\Models\User;
use App\Support\Text;
use Database\Seeders\TaxonomySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CatalogPullTest extends TestCase
{
    use RefreshDatabase;

    private function anna(): User
    {
        return User::factory()->create();
    }

    private function esercizio(string $uid, string $nome, string $stato = 'published'): Exercise
    {
        return Exercise::create([
            'uid' => $uid,
            'name' => $nome,
            'name_norm' => Text::normalize($nome),
            'muscle_group' => 'petto',
            'instructions' => 'Come si fa.',
            'status' => $stato,
        ]);
    }

    public function test_il_primo_pull_porta_il_catalogo_pubblicato(): void
    {
        $this->esercizio('a', 'Panca piana');
        $this->esercizio('b', 'Croci', 'pending');

        $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.uid', 'a')
            ->assertJsonPath('data.0.instructions', 'Come si fa.');
    }

    public function test_il_primo_pull_non_porta_i_cancellati(): void
    {
        // Una voce cancellata prima che questo telefono l'abbia mai vista non
        // ha niente da raccontare: mandargli un tombstone per una riga che non
        // ha vorrebbe dire fargli cercare qualcosa che non esiste.
        $this->esercizio('a', 'Panca piana')->delete();

        $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_il_pull_incrementale_porta_solo_il_cambiato(): void
    {
        $vecchio = $this->esercizio('a', 'Panca piana');
        $vecchio->forceFill(['updated_at' => '2026-01-01 10:00:00'])->saveQuietly();

        $this->esercizio('b', 'Croci');

        $risposta = $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises?since=2026-06-01T00:00:00Z')
            ->assertOk();

        $risposta->assertJsonCount(1, 'data')->assertJsonPath('data.0.uid', 'b');
    }

    public function test_il_pull_incrementale_porta_i_cancellati(): void
    {
        $voce = $this->esercizio('a', 'Panca piana');
        $voce->delete();

        $risposta = $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises?since=2020-01-01T00:00:00Z')
            ->assertOk();

        $risposta->assertJsonPath('data.0.uid', 'a')
            ->assertJsonPath('data.0.name', null);
        $this->assertNotNull($risposta->json('data.0.deletedAt'));
    }

    public function test_il_cursore_non_salta_righe_con_lo_stesso_istante(): void
    {
        // E' il caso che rompe un cursore fatto del solo timestamp: duecento
        // righe scritte da `catalog:seed` nello stesso secondo.
        for ($i = 1; $i <= 5; $i++) {
            $this->esercizio("uid-{$i}", "Esercizio {$i}");
        }
        Exercise::query()->update(['updated_at' => '2026-09-07 12:00:00']);

        $viste = [];
        $query = '?since=2020-01-01T00:00:00Z&limit=2';

        do {
            $r = $this->actingAs($this->anna())
                ->getJson("/api/catalog/exercises{$query}")
                ->assertOk();

            foreach ($r->json('data') as $voce) {
                $viste[] = $voce['uid'];
            }

            $next = $r->json('next');
            if ($next) {
                $query = '?since='.urlencode($next['since'])
                    .'&afterId='.$next['afterId'].'&limit=2';
            }
        } while ($next !== null);

        sort($viste);
        $this->assertSame(['uid-1', 'uid-2', 'uid-3', 'uid-4', 'uid-5'], $viste);
    }

    public function test_senza_account_non_si_legge_niente(): void
    {
        $this->getJson('/api/catalog/exercises')->assertUnauthorized();
    }

    /**
     * Convenzione del repo: ogni endpoint che pubblica qualcosa ha un test
     * con un secondo account vero che legge quel che non e' suo. Qui non
     * c'e' un confine di visibilita' da forzare - il catalogo pubblicato e'
     * di tutti per disegno - ma c'e' comunque una promessa di privacy da
     * verificare da fuori.
     *
     * Un elenco completo delle chiavi (whitelist), non un controllo
     * sull'assenza di `created_by`/`createdBy` (blacklist): una blacklist
     * cattura solo i nomi a cui si e' pensato, una whitelist cattura anche
     * `reviewed_by`, `review_note` o qualunque campo futuro che trapeli per
     * disattenzione. E' lo stesso schema di
     * `ExerciseCatalogTest::test_il_catalogo_non_dice_chi_ha_aggiunto_cosa`.
     */
    public function test_il_pull_non_dice_chi_ha_aggiunto_cosa(): void
    {
        $anna = $this->anna();
        $bea = $this->anna();

        $esercizio = $this->esercizio('a', 'Panca piana');
        $esercizio->forceFill(['created_by' => $anna->id])->saveQuietly();

        $risposta = $this->actingAs($bea)
            ->getJson('/api/catalog/exercises')
            ->assertOk();

        $corpo = $risposta->json('data.0');
        $this->assertSame(
            [
                'uid',
                'name',
                'nameNorm',
                'muscleGroup',
                'secondaryMuscles',
                'equipment',
                'instructions',
                'photo',
                'mine',
                'deletedAt',
            ],
            array_keys($corpo),
        );
        // Bea non l'ha aggiunta lei, e da qui non ha modo di sapere chi.
        $this->assertFalse($corpo['mine']);
    }

    /**
     * Il buco vero: `min($limit, PER_PAGE)` limava solo il tetto superiore,
     * e Laravel non applica affatto un `limit()` negativo - la query
     * tornava la tabella intera invece di rifiutare la richiesta. Ora e'
     * validato, e un valore fuori dai limiti e' un 422 leggibile.
     */
    public function test_limit_negativo_e_un_422_non_uno_scarico_della_tabella(): void
    {
        $this->esercizio('a', 'Panca piana');
        $this->esercizio('b', 'Croci');

        $this->actingAs($this->anna())
            ->getJson('/api/catalog/exercises?limit=-1')
            ->assertStatus(422);
    }

    /**
     * Gemello di `test_il_pull_non_dice_chi_ha_aggiunto_cosa`, per gli
     * alimenti: il payload ha piu' campi e la stessa promessa di privacy da
     * mantenere, e non c'era ancora un test che la fissasse con una
     * whitelist.
     */
    public function test_il_pull_dei_cibi_non_dice_chi_ha_aggiunto_cosa(): void
    {
        $anna = $this->anna();
        $bea = $this->anna();

        Food::create([
            'uid' => 'f-1',
            'name' => 'Petto di pollo',
            'name_norm' => Text::normalize('Petto di pollo'),
            'kcal' => 165,
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

        $risposta = $this->actingAs($bea)
            ->getJson('/api/catalog/foods')
            ->assertOk();

        $corpo = $risposta->json('data.0');
        $this->assertSame(
            [
                'uid',
                'name',
                'nameNorm',
                'brand',
                'barcode',
                'offId',
                'kcal',
                'protein',
                'carbs',
                'sugars',
                'fat',
                'saturatedFat',
                'fiber',
                'salt',
                'isLiquid',
                'defaultServingG',
                'servingLabel',
                'image',
                'mine',
                'deletedAt',
            ],
            array_keys($corpo),
        );
        // Bea non l'ha aggiunto lei, e da qui non ha modo di sapere chi.
        $this->assertFalse($corpo['mine']);
    }

    public function test_le_tassonomie_escono_ordinate(): void
    {
        $this->seed(TaxonomySeeder::class);

        $r = $this->actingAs($this->anna())
            ->getJson('/api/catalog/taxonomies')
            ->assertOk();

        $this->assertCount(12, $r->json('muscleGroups'));
        $this->assertCount(11, $r->json('equipment'));
        // L'ordine e' quello di `sort`, non alfabetico: nessuno pensa il
        // corpo in ordine alfabetico.
        $this->assertSame('petto', $r->json('muscleGroups.0.slug'));
        $this->assertSame('Chest', $r->json('muscleGroups.0.labelEn'));
    }

    public function test_una_tassonomia_cancellata_esce_come_tombstone(): void
    {
        $this->seed(TaxonomySeeder::class);
        MuscleGroup::where('slug', 'polpacci')->first()->delete();

        $r = $this->actingAs($this->anna())
            ->getJson('/api/catalog/taxonomies')
            ->assertOk();

        // Esce comunque, con la data: il telefono ha esercizi che nominano
        // quello slug, e togliergli la riga senza dirglielo li lascerebbe
        // senza etichetta e senza un motivo leggibile.
        $polpacci = collect($r->json('muscleGroups'))->firstWhere('slug', 'polpacci');
        $this->assertNotNull($polpacci['deletedAt']);
    }

    public function test_una_foto_di_catalogo_si_scarica(): void
    {
        Storage::fake('local');
        Storage::disk('local')
            ->put('catalog/abc.jpg', 'byte');

        $this->actingAs($this->anna())
            ->get('/api/catalog/images/abc.jpg')
            ->assertOk();
    }

    public function test_una_foto_di_catalogo_non_si_scarica_senza_account(): void
    {
        $this->get('/api/catalog/images/abc.jpg')->assertUnauthorized();
    }

    public function test_un_nome_di_foto_con_traversata_non_passa(): void
    {
        $this->actingAs($this->anna())
            ->get('/api/catalog/images/..')
            ->assertNotFound();
    }
}
