<?php

namespace Tests\Feature;

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
}
