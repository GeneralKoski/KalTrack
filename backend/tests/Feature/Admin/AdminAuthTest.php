<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_amministratore_entra(): void
    {
        User::factory()->create([
            'handle' => 'martin',
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'password123',
        ])->assertOk();

        $this->assertAuthenticated();
    }

    public function test_si_entra_anche_col_nome_utente(): void
    {
        User::factory()->create([
            'handle' => 'Martin',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        // "A" e "a" sono lo stesso nome, ovunque: e' la regola di
        // `User::whereHandle`, e vale anche qui.
        $this->postJson('/admin/login', [
            'login' => 'martin',
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        User::factory()->create([
            'email' => 'anna@example.test',
            'password' => 'password123',
            'is_admin' => false,
        ]);

        /*
         * Rifiuta all'accesso, non dopo.
         *
         * Farlo entrare e poi mostrargli pagine vuote sarebbe peggio in due
         * modi: sembrerebbe un'app rotta, e lascerebbe una sessione aperta a
         * qualcuno che non deve averne una.
         */
        $this->postJson('/admin/login', [
            'login' => 'anna@example.test',
            'password' => 'password123',
        ])->assertStatus(422);

        $this->assertGuest();
    }

    public function test_la_password_sbagliata_non_entra(): void
    {
        User::factory()->create([
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'sbagliata',
        ])->assertStatus(422);

        $this->assertGuest();
    }

    public function test_con_la_sessione_si_chiamano_le_rotte_admin(): void
    {
        $admin = User::factory()->create([
            'email' => 'martin@example.test',
            'password' => 'password123',
            'is_admin' => true,
        ]);

        $this->postJson('/admin/login', [
            'login' => 'martin@example.test',
            'password' => 'password123',
        ])->assertOk();

        // E' il punto di tutta la scelta: la SPA chiama l'API col cookie di
        // sessione, senza un token da custodire nel browser.
        $this->getJson('/api/admin/stats')->assertOk();
    }

    public function test_si_esce(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $this->actingAs($admin);

        $this->postJson('/admin/logout')->assertOk();

        $this->assertGuest();
    }
}
