<?php

namespace Tests\Feature\Admin;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use App\Support\Text;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SubmissionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $anna;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true, 'handle' => 'martin']);
        $this->anna = User::factory()->create(['handle' => 'anna', 'display_name' => 'Anna']);
    }

    private function proposta(string $nome = 'Pasta della Lidl'): Food
    {
        return Food::create([
            'uid' => 'p-1',
            'name' => $nome,
            'name_norm' => Text::normalize($nome),
            'kcal' => 353,
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);
    }

    private function propostaEsercizio(string $nome = 'Rematore con bilanciere'): Exercise
    {
        return Exercise::create([
            'name' => $nome,
            'name_norm' => Text::normalize($nome),
            'muscle_group' => 'back',
            'secondary_muscles' => 'biceps',
            'equipment' => 'bilanciere',
            'instructions' => 'Busto inclinato, tira verso l\'addome.',
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);
    }

    public function test_l_elenco_dice_chi_ha_proposto(): void
    {
        $this->proposta();

        /*
         * `created_by` non esce da nessuna risposta verso un utente normale,
         * ed e' scritto nella migrazione della tabella. Qui esce, e la
         * differenza e' il motivo: in revisione bisogna sapere chi propone
         * cosa, se non altro per riconoscere chi propone spazzatura. Il
         * catalogo continua a non dirlo a nessun altro.
         */
        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=food')
            ->assertOk()
            ->assertJsonPath('data.0.author.handle', 'anna')
            ->assertJsonPath('data.0.name', 'Pasta della Lidl');
    }

    public function test_l_elenco_mostra_solo_le_proposte(): void
    {
        $this->proposta();
        Food::create([
            'uid' => 'p-2',
            'name' => 'Riso',
            'name_norm' => 'riso',
            'kcal' => 330,
            'status' => 'published',
        ]);

        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=food')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_approvare_pubblica_e_registra_chi_ha_deciso(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve")
            ->assertOk();

        $voce->refresh();
        $this->assertSame('published', $voce->status);
        $this->assertSame($this->admin->id, $voce->reviewed_by);
        $this->assertNotNull($voce->reviewed_at);
    }

    public function test_si_corregge_mentre_si_approva(): void
    {
        $voce = $this->proposta();

        /*
         * Una correzione e un'approvazione sono la stessa richiesta e non
         * due: in revisione si guarda e si corregge nello stesso gesto, e due
         * chiamate separate possono divergere - la seconda fallisce e la
         * prima e' gia' passata.
         */
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", [
                'name' => 'Pasta di semola Lidl',
                'brand' => 'Lidl',
                'kcal' => 350,
            ])
            ->assertOk();

        $voce->refresh();
        $this->assertSame('Pasta di semola Lidl', $voce->name);
        $this->assertSame('pasta di semola lidl', $voce->name_norm);
        $this->assertSame('Lidl', $voce->brand);
        $this->assertEqualsWithDelta(350.0, $voce->kcal, 0.01);
        $this->assertSame('published', $voce->status);
    }

    /**
     * Gemello di `AdminFoodTest::test_un_nutriente_si_puo_svuotare`: le due
     * FormRequest avevano la stessa lacuna, e qui morde nel momento peggiore -
     * una proposta arriva da un telefono, scritta di fretta, e correggerla
     * puo' voler dire togliere un valore inventato, non sostituirlo.
     */
    public function test_un_nutriente_si_puo_svuotare_approvando(): void
    {
        $voce = $this->proposta();
        $voce->sugars = 3.6;
        $voce->save();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", ['sugars' => null])
            ->assertOk();

        $voce->refresh();
        // Zero e non `null` - la colonna e' `NOT NULL DEFAULT 0` - e il 3.6
        // inventato e' andato via, che e' il punto.
        $this->assertEqualsWithDelta(0.0, $voce->sugars, 0.001);
        $this->assertSame('published', $voce->status);
    }

    public function test_rifiutare_non_toglie_niente_a_nessuno(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject", [
                'note' => 'I valori non corrispondono all\'etichetta.',
            ])
            ->assertOk();

        $voce->refresh();
        $this->assertSame('rejected', $voce->status);
        $this->assertSame('I valori non corrispondono all\'etichetta.', $voce->review_note);
        // La riga resta: l'autore ce l'ha sul telefono e li' nessuno gliela
        // tocca. Rifiutare vuol dire "non entra nel catalogo", non "sparisce".
        $this->assertNotNull(Food::find($voce->id));
    }

    public function test_una_voce_rifiutata_non_esce_dal_catalogo(): void
    {
        $voce = $this->proposta();
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject")
            ->assertOk();

        $this->actingAs($this->anna)
            ->getJson('/api/catalog/foods')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_approvare_su_un_nome_gia_in_catalogo_fallisce_leggibilmente(): void
    {
        Food::create([
            'uid' => 'esistente',
            'name' => 'Pasta della Lidl',
            'name_norm' => 'pasta della lidl',
            'kcal' => 353,
            'status' => 'published',
        ]);
        $voce = Food::create([
            'uid' => 'p-9',
            'name' => 'Pasta Della  Lidl',
            'name_norm' => 'pasta della lidl 2',
            'kcal' => 350,
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);

        // Senza questo controllo risponderebbe il vincolo unico del database,
        // con un errore che nessuno puo' interpretare a schermo.
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", [
                'name' => 'Pasta della Lidl',
                'kcal' => 350,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_approvare_su_un_nome_di_una_voce_cancellata_fallisce_leggibilmente(): void
    {
        $cancellata = Food::create([
            'uid' => 'cancellata',
            'name' => 'Pasta della Lidl',
            'name_norm' => 'pasta della lidl',
            'kcal' => 353,
            'status' => 'published',
        ]);
        $cancellata->delete();

        $voce = Food::create([
            'uid' => 'p-9',
            'name' => 'Pasta Della  Lidl',
            'name_norm' => 'pasta della lidl 2',
            'kcal' => 350,
            'status' => 'pending',
            'created_by' => $this->anna->id,
        ]);

        /*
         * L'indice unico su `name_norm` copre anche le righe cancellate:
         * senza `withTrashed()` in questo controllo, la correzione passa qui
         * e il database la respinge con una `QueryException` non gestita -
         * un 500 invece del 422 leggibile che questo controllo esiste per
         * dare.
         */
        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", [
                'name' => 'Pasta della Lidl',
                'kcal' => 350,
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    /**
     * Il tetto era 9999 qui e 100 nell'app (`FoodController`): si poteva
     * approvare una proposta scrivendo `protein: 9999` per 100 g. Ora e' lo
     * stesso tetto dappertutto (`Food::MAX_NUTRIENT_GRAMS`).
     */
    public function test_non_si_approva_scrivendo_un_macro_fuori_scala(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve", ['protein' => 9999])
            ->assertStatus(422);

        $this->assertSame('pending', $voce->fresh()->status);
    }

    public function test_l_elenco_mostra_i_campi_di_un_esercizio(): void
    {
        $this->propostaEsercizio();

        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=exercise')
            ->assertOk()
            ->assertJsonPath('data.0.fields.muscleGroup', 'back')
            ->assertJsonPath('data.0.fields.secondaryMuscles', 'biceps')
            ->assertJsonPath('data.0.fields.equipment', 'bilanciere')
            ->assertJsonPath('data.0.fields.instructions', 'Busto inclinato, tira verso l\'addome.');
    }

    public function test_si_corregge_un_esercizio_mentre_si_approva(): void
    {
        $voce = $this->propostaEsercizio();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/exercise/{$voce->id}/approve", [
                'instructions' => 'Schiena dritta, gomiti vicini al busto.',
            ])
            ->assertOk();

        $voce->refresh();
        $this->assertSame('Schiena dritta, gomiti vicini al busto.', $voce->instructions);
        $this->assertSame('published', $voce->status);
    }

    public function test_un_tipo_sconosciuto_non_esiste(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=ricette')
            ->assertNotFound();
    }

    /**
     * `destroy()` toglie una voce pubblicata con un tombstone vero, che il
     * pull manda ai telefoni. Senza questo rifiuto, `reject()` scriveva
     * `status = 'rejected'` su una voce gia' pubblicata, e da li' in poi
     * `CatalogController::pull()` - che filtra sempre `where('status',
     * 'published')` prima del ramo del tombstone - la faceva sparire dal
     * catalogo senza mai dirlo a chi l'aveva gia' scaricata.
     */
    public function test_rifiutare_una_voce_gia_pubblicata_e_rifiutato(): void
    {
        $voce = Food::create([
            'uid' => 'pubblicata',
            'name' => 'Riso',
            'name_norm' => 'riso',
            'kcal' => 330,
            'status' => 'published',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject")
            ->assertStatus(422);

        $this->assertSame('published', $voce->fresh()->status);
    }

    /**
     * Approvare una voce gia' pubblicata non e' un'operazione: non c'e' una
     * proposta dietro, e farlo comunque riscriverebbe `reviewed_by` e
     * `reviewed_at` senza che nessuno abbia deciso niente.
     */
    public function test_approvare_una_voce_gia_pubblicata_e_rifiutato(): void
    {
        $voce = Food::create([
            'uid' => 'pubblicata',
            'name' => 'Riso',
            'name_norm' => 'riso',
            'kcal' => 330,
            'status' => 'published',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve")
            ->assertStatus(422);

        $voce->refresh();
        $this->assertSame('published', $voce->status);
        $this->assertNull($voce->reviewed_by);
    }

    /**
     * Il test che avrebbe preso il difetto sul nascere: una proposta ancora
     * in attesa deve continuare a rifiutarsi esattamente come prima. Il
     * guardiano nuovo non deve stringere il caso normale.
     */
    public function test_rifiutare_una_proposta_in_attesa_funziona_come_prima(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->admin)
            ->postJson("/api/admin/submissions/food/{$voce->id}/reject")
            ->assertOk();

        $this->assertSame('rejected', $voce->fresh()->status);
    }

    public function test_chi_non_e_amministratore_non_revisiona(): void
    {
        $voce = $this->proposta();

        $this->actingAs($this->anna)
            ->getJson('/api/admin/submissions?type=food')
            ->assertForbidden();

        $this->actingAs($this->anna)
            ->postJson("/api/admin/submissions/food/{$voce->id}/approve")
            ->assertForbidden();
    }
}
