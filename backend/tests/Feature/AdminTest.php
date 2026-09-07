<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Rimettere a posto la password di qualcuno.
 *
 * Serve perche' non c'e' il recupero via email. Il rischio ovvio e' che
 * diventi il modo per entrare nell'account di chiunque, quindi qui si verifica
 * soprattutto chi NON puo' usarlo.
 */
class AdminTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle, bool $admin = false): User
    {
        return User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
            'is_admin' => $admin,
        ]);
    }

    public function test_un_amministratore_cambia_la_password_di_un_altro(): void
    {
        $capo = $this->user('capo', admin: true);
        $anna = $this->user('anna');

        $this->actingAs($capo)
            ->postJson("/api/admin/users/{$anna->id}/password", [
                'password' => 'nuova-password',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('nuova-password', $anna->fresh()->password));
    }

    /**
     * Il controllo sta sul server e non nella schermata. L'app nasconde la
     * voce, ma nascondere non e' proteggere: chi conosce l'indirizzo lo chiama
     * lo stesso.
     */
    public function test_chi_non_e_amministratore_non_puo_cambiare_password_altrui(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');

        $this->actingAs($anna)
            ->postJson("/api/admin/users/{$bruno->id}/password", [
                'password' => 'me-la-prendo-io',
            ])
            ->assertForbidden();

        $this->assertTrue(Hash::check('password123', $bruno->fresh()->password));
    }

    public function test_chi_non_e_amministratore_non_vede_nemmeno_l_elenco(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->getJson('/api/admin/users')->assertForbidden();
    }

    public function test_senza_account_non_si_arriva_da_nessuna_parte(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }

    /**
     * Una password si cambia anche perche' si teme che qualcuno la conosca:
     * lasciare aperte le sessioni gia' avviate renderebbe il cambio una
     * formalita'.
     */
    public function test_cambiare_la_password_chiude_le_sessioni_aperte(): void
    {
        $capo = $this->user('capo', admin: true);
        $anna = $this->user('anna');
        $anna->createToken('telefono');

        $this->assertSame(1, $anna->tokens()->count());

        $this->actingAs($capo)
            ->postJson("/api/admin/users/{$anna->id}/password", [
                'password' => 'nuova-password',
            ])
            ->assertOk();

        $this->assertSame(0, $anna->fresh()->tokens()->count());
    }

    public function test_una_password_troppo_corta_viene_rifiutata(): void
    {
        $capo = $this->user('capo', admin: true);
        $anna = $this->user('anna');

        $this->actingAs($capo)
            ->postJson("/api/admin/users/{$anna->id}/password", ['password' => 'corta'])
            ->assertStatus(422);
    }

    public function test_nessuno_e_amministratore_per_caso(): void
    {
        $anna = $this->user('anna');

        $this->assertFalse($anna->is_admin);
    }

    public function test_il_gruppo_admin_e_chiuso_a_chi_non_lo_e(): void
    {
        $anna = User::factory()->create(['is_admin' => false]);

        // Ogni rotta del gruppo, una per una: un controllo scritto a mano in
        // ogni metodo e' un controllo che prima o poi si dimentica in uno, ed
        // e' esattamente il motivo per cui e' diventato un middleware.
        foreach (['/api/admin/users'] as $rotta) {
            $this->actingAs($anna)->getJson($rotta)->assertForbidden();
        }
    }

    public function test_il_gruppo_admin_e_chiuso_a_chi_non_ha_un_account(): void
    {
        $this->getJson('/api/admin/users')->assertUnauthorized();
    }

    public function test_il_profilo_dice_se_l_ai_e_attiva(): void
    {
        $user = User::factory()->create();
        // La factory non rilegge la colonna dopo l'insert: Eloquent scrive solo la
        // primary key, e senza un refresh() la variabile $user contiene solo i campi
        // espliciti della factory. Il resto rimane nullo nel modello, anche se il
        // database ha i default. L'istanza in memoria è quella che actingAs passa al
        // controller, quindi senza questo refresh l'asserzione verificherebbe un
        // default inventato dal test, non quello scritto dalla migrazione.
        $user->refresh();

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('aiEnabled', true);

        $user->update(['ai_enabled' => false]);

        $this->actingAs($user)
            ->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('aiEnabled', false);
    }

    public function test_l_elenco_utenti_conta_le_proposte(): void
    {
        $admin = User::factory()->create(['is_admin' => true, 'handle' => 'martin']);
        $anna = User::factory()->create(['handle' => 'anna']);

        Food::create([
            'uid' => 'a', 'name' => 'Uno', 'name_norm' => 'uno',
            'status' => 'pending', 'created_by' => $anna->id,
        ]);
        Food::create([
            'uid' => 'b', 'name' => 'Due', 'name_norm' => 'due',
            'status' => 'published', 'created_by' => $anna->id,
        ]);

        $r = $this->actingAs($admin)->getJson('/api/admin/users')->assertOk();

        $riga = collect($r->json('users'))->firstWhere('handle', 'anna');
        // Due proposte fatte, una entrata in catalogo: e' il numero con cui
        // si riconosce chi propone spazzatura senza doverle riaprire tutte.
        $this->assertSame(2, $riga['submitted']);
        $this->assertSame(1, $riga['published']);
        $this->assertTrue($riga['aiEnabled']);
    }

    public function test_si_spegne_e_si_riaccende_l_ai_a_qualcuno(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $anna = User::factory()->create();

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", ['aiEnabled' => false])
            ->assertOk();

        $this->assertFalse($anna->fresh()->ai_enabled);

        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", ['aiEnabled' => true])
            ->assertOk();

        $this->assertTrue($anna->fresh()->ai_enabled);
    }

    public function test_l_interruttore_ai_non_tocca_altro(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $anna = User::factory()->create(['is_admin' => false, 'handle' => 'anna']);

        // Il corpo di questa PATCH accetta un campo solo: promuovere qualcuno
        // ad amministratore non e' fra le cose che il gestionale fa, e un
        // `fill()` generoso lo renderebbe possibile per sbaglio.
        $this->actingAs($admin)
            ->patchJson("/api/admin/users/{$anna->id}", [
                'aiEnabled' => false,
                'isAdmin' => true,
                'handle' => 'rubato',
            ])
            ->assertOk();

        $anna->refresh();
        $this->assertFalse($anna->is_admin);
        $this->assertSame('anna', $anna->handle);
    }

    public function test_le_statistiche_dicono_cosa_manca(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);

        Exercise::create([
            'uid' => 'a', 'name' => 'Con testo', 'name_norm' => 'con testo',
            'muscle_group' => 'petto', 'status' => 'published',
            'instructions' => 'Come si fa.', 'photo' => 'a.jpg',
        ]);
        Exercise::create([
            'uid' => 'b', 'name' => 'Muto', 'name_norm' => 'muto',
            'muscle_group' => 'petto', 'status' => 'published',
        ]);
        Food::create([
            'uid' => 'c', 'name' => 'Proposta', 'name_norm' => 'proposta',
            'status' => 'pending',
        ]);

        $this->actingAs($admin)->getJson('/api/admin/stats')
            ->assertOk()
            ->assertJsonPath('published.exercises', 2)
            ->assertJsonPath('pending.foods', 1)
            // I due numeri che dicono cosa manca: senza, 128 esercizi su 200
            // sono rimasti muti per mesi e nessuno lo sapeva.
            ->assertJsonPath('missing.instructions', 1)
            ->assertJsonPath('missing.photos', 1);
    }

    public function test_le_statistiche_sono_chiuse_a_chi_non_e_amministratore(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/admin/stats')
            ->assertForbidden();
    }

    /**
     * Una proposta cancellata dall'amministratore e' successa lo stesso.
     *
     * `Exercise`/`Food` usano SoftDeletes, quindi una `HasMany` normale
     * escluderebbe le righe cancellate dal conteggio: chi ha proposto cento
     * voci scadenti, poi tutte cancellate in revisione, apparirebbe con zero
     * proposte - esattamente il segnale che questi due numeri servono a dare.
     * Per questo submitted/published leggono anche le righe con
     * `deleted_at` valorizzato.
     */
    public function test_una_proposta_cancellata_conta_ancora(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $anna = User::factory()->create(['handle' => 'anna']);

        $esercizio = Exercise::create([
            'uid' => 'x', 'name' => 'Sparito', 'name_norm' => 'sparito',
            'muscle_group' => 'petto', 'status' => 'published',
            'created_by' => $anna->id,
        ]);
        $esercizio->delete();

        $riga = collect(
            $this->actingAs($admin)->getJson('/api/admin/users')->json('users'),
        )->firstWhere('handle', 'anna');

        $this->assertSame(1, $riga['submitted']);
        $this->assertSame(1, $riga['published']);
    }
}
