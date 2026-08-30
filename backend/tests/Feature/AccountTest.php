<?php

namespace Tests\Feature;

use App\Models\SharedStat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountTest extends TestCase
{
    use RefreshDatabase;

    private array $valid = [
        'email' => 'anna@example.test',
        'password' => 'password123',
        'handle' => 'anna',
        'displayName' => 'Anna',
    ];

    public function test_registrazione_e_login(): void
    {
        $this->postJson('/api/register', $this->valid)
            ->assertCreated()
            ->assertJsonStructure(['token', 'handle']);

        $this->postJson('/api/login', [
            'login' => 'anna@example.test',
            'password' => 'password123',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_si_entra_anche_con_il_nome_utente(): void
    {
        $this->postJson('/api/register', $this->valid)->assertCreated();

        $this->postJson('/api/login', [
            'login' => 'anna',
            'password' => 'password123',
        ])->assertOk()->assertJsonStructure(['token']);
    }

    /**
     * Un nome utente si scrive a mano su una tastiera del telefono, che mette
     * la maiuscola per conto suo. Rifiutare "Anna" a chi si e' registrato come
     * "anna" sarebbe un errore incomprensibile.
     */
    public function test_il_nome_utente_non_e_sensibile_alle_maiuscole(): void
    {
        $this->postJson('/api/register', $this->valid)->assertCreated();

        $this->postJson('/api/login', [
            'login' => 'ANNA',
            'password' => 'password123',
        ])->assertOk();
    }

    public function test_un_nome_utente_inesistente_non_entra(): void
    {
        $this->postJson('/api/register', $this->valid)->assertCreated();

        $this->postJson('/api/login', [
            'login' => 'nessuno',
            'password' => 'password123',
        ])->assertStatus(422);
    }

    public function test_un_handle_gia_preso_viene_rifiutato(): void
    {
        $this->postJson('/api/register', $this->valid)->assertCreated();

        $this->postJson('/api/register', [
            ...$this->valid,
            'email' => 'altra@example.test',
        ])->assertUnprocessable()->assertJsonValidationErrors('handle');
    }

    /**
     * Maiuscole e caratteri strani fuori: due handle che differiscono solo per
     * le maiuscole sarebbero due persone indistinguibili in una lista.
     */
    public function test_l_handle_accetta_lettere_numeri_e_underscore(): void
    {
        // 'Anna' non e' piu' qui: le maiuscole si possono scrivere e si
        // conservano. Quel che resta fuori e' cio' che rende un nome utente
        // ambiguo da scrivere o da leggere.
        foreach (['an na', 'anna!', 'an', 'aà'] as $handle) {
            $this->postJson('/api/register', [
                ...$this->valid,
                'email' => "{$handle}@example.test",
                'handle' => $handle,
            ])->assertUnprocessable();
        }

        $this->postJson('/api/register', [
            ...$this->valid,
            'handle' => 'anna_2',
        ])->assertCreated();
    }

    public function test_la_password_sbagliata_non_dice_se_l_email_esiste(): void
    {
        $this->postJson('/api/register', $this->valid)->assertCreated();

        $esistente = $this->postJson('/api/login', [
            'email' => 'anna@example.test',
            'password' => 'sbagliata',
        ]);
        $inesistente = $this->postJson('/api/login', [
            'email' => 'nessuno@example.test',
            'password' => 'sbagliata',
        ]);

        $esistente->assertUnprocessable();
        $inesistente->assertUnprocessable();
        $this->assertSame(
            $esistente->json('message'),
            $inesistente->json('message'),
        );
    }

    public function test_le_condivisioni_partono_tutte_spente(): void
    {
        $this->postJson('/api/register', $this->valid);
        $user = User::where('handle', 'anna')->firstOrFail();

        $this->actingAs($user)->getJson('/api/me')
            ->assertOk()
            ->assertJsonPath('shares.calories', false)
            ->assertJsonPath('shares.steps', false)
            ->assertJsonPath('shares.weight', false)
            ->assertJsonPath('shares.workouts', false);
    }

    public function test_si_cambiano_le_condivisioni(): void
    {
        $this->postJson('/api/register', $this->valid);
        $user = User::where('handle', 'anna')->firstOrFail();

        $this->actingAs($user)->patchJson('/api/me', [
            'shareSteps' => true,
            'bio' => 'Corro la mattina',
        ])->assertOk()
            ->assertJsonPath('shares.steps', true)
            ->assertJsonPath('shares.calories', false)
            ->assertJsonPath('bio', 'Corro la mattina');
    }

    public function test_il_telefono_pubblica_i_totali_e_li_sostituisce(): void
    {
        $this->postJson('/api/register', $this->valid);
        $user = User::where('handle', 'anna')->firstOrFail();

        $this->actingAs($user)->putJson('/api/me/stats', [
            'days' => [
                ['date' => '2026-08-28', 'kcal' => 2100, 'steps' => 9450],
                ['date' => '2026-08-29', 'kcal' => 1800, 'steps' => null],
            ],
        ])->assertOk()->assertJsonPath('synced', 2);

        $this->assertSame(2, SharedStat::count());
        // Null resta null: il telefono dice "non registrato", non "zero".
        $this->assertNull(SharedStat::where('date', '2026-08-29')->first()->steps);

        // Una seconda pubblicazione sostituisce, non aggiunge.
        $this->actingAs($user)->putJson('/api/me/stats', [
            'days' => [['date' => '2026-08-28', 'kcal' => 2200]],
        ])->assertOk();

        $this->assertSame(2, SharedStat::count());
        $this->assertSame(2200, SharedStat::where('date', '2026-08-28')->first()->kcal);
    }

    public function test_i_totali_implausibili_sono_rifiutati(): void
    {
        $this->postJson('/api/register', $this->valid);
        $user = User::where('handle', 'anna')->firstOrFail();

        $this->actingAs($user)->putJson('/api/me/stats', [
            'days' => [['date' => '2026-08-28', 'weightKg' => 900]],
        ])->assertUnprocessable();

        $this->actingAs($user)->putJson('/api/me/stats', [
            'days' => [['date' => '28/08/2026']],
        ])->assertUnprocessable();
    }
    /**
     * Le maiuscole si conservano ma non distinguono: due nomi utente che
     * differiscono solo per quelle sarebbero due persone che nessuna lista sa
     * separare, e - da quando si entra anche col nome utente - due righe che
     * l'accesso non saprebbe scegliere.
     */
    public function test_un_nome_utente_gia_preso_lo_e_anche_con_altre_maiuscole(): void
    {
        $this->postJson('/api/register', [...$this->valid, 'handle' => 'GeneralKoski'])
            ->assertCreated();

        $this->postJson('/api/register', [
            ...$this->valid,
            'email' => 'altro@example.test',
            'handle' => 'generalkoski',
        ])->assertUnprocessable();
    }

    public function test_le_maiuscole_del_nome_utente_si_conservano(): void
    {
        $this->postJson('/api/register', [...$this->valid, 'handle' => 'GeneralKoski'])
            ->assertCreated()
            ->assertJsonPath('handle', 'GeneralKoski');
    }

    /**
     * La ricerca segue la stessa regola dell'unicita': se "A" e "a" sono lo
     * stesso nome quando si registra, devono esserlo anche quando si cerca.
     * Altrimenti un profilo esistente non si trova, e chi cerca conclude che
     * la persona non e' iscritta.
     */
    public function test_la_ricerca_ignora_le_maiuscole(): void
    {
        $this->postJson('/api/register', [...$this->valid, 'handle' => 'GeneralKoski'])
            ->assertCreated();
        $chiCerca = User::create([
            'name' => 'bruno', 'display_name' => 'Bruno',
            'email' => 'bruno@example.test', 'password' => 'password123',
            'handle' => 'bruno',
        ]);

        foreach (['Generalkoski', 'generalkoski', 'GENERALKOSKI'] as $termine) {
            $this->actingAs($chiCerca)
                ->getJson("/api/users?q={$termine}")
                ->assertOk()
                ->assertJsonPath('data.0.handle', 'GeneralKoski');
        }
    }

    public function test_il_profilo_si_apre_con_qualsiasi_maiuscola(): void
    {
        $this->postJson('/api/register', [...$this->valid, 'handle' => 'GeneralKoski'])
            ->assertCreated();
        $chiGuarda = User::create([
            'name' => 'bruno', 'display_name' => 'Bruno',
            'email' => 'bruno@example.test', 'password' => 'password123',
            'handle' => 'bruno',
        ]);

        $this->actingAs($chiGuarda)
            ->getJson('/api/users/generalkoski')
            ->assertOk()
            ->assertJsonPath('data.handle', 'GeneralKoski');
    }

}
