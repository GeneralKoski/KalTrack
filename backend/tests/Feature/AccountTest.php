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
            'email' => 'anna@example.test',
            'password' => 'password123',
        ])->assertOk()->assertJsonStructure(['token']);
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
    public function test_l_handle_accetta_solo_minuscole_numeri_e_underscore(): void
    {
        foreach (['Anna', 'an na', 'anna!', 'an', 'aà'] as $handle) {
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
}
