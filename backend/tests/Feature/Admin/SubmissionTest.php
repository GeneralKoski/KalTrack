<?php

namespace Tests\Feature\Admin;

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

    public function test_un_tipo_sconosciuto_non_esiste(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/submissions?type=ricette')
            ->assertNotFound();
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
