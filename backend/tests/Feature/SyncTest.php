<?php

namespace Tests\Feature;

use App\Models\SyncRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * La sincronizzazione del database del telefono.
 *
 * Il telefono resta la fonte di verita': qui si verifica che il server tenga
 * una copia fedele, che non perda modifiche e che non ne resusciti di vecchie.
 */
class SyncTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle = 'anna'): User
    {
        return User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
        ]);
    }

    private function change(array $over = []): array
    {
        return [
            'table' => 'foods',
            'id' => (string) Str::uuid(),
            'payload' => ['name' => 'Riso', 'kcal' => 130],
            'updatedAt' => '2026-08-29T10:00:00+00:00',
            'deletedAt' => null,
            'createdAt' => '2026-08-29T10:00:00+00:00',
            ...$over,
        ];
    }

    public function test_una_riga_mandata_viene_conservata(): void
    {
        $anna = $this->user();
        $change = $this->change();

        $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => [$change]])
            ->assertOk()
            ->assertJsonPath('applied', 1);

        $record = SyncRecord::firstOrFail();
        $this->assertSame('foods', $record->table_name);
        $this->assertSame($change['id'], $record->record_id);
        $this->assertSame('Riso', $record->payload['name']);
    }

    /**
     * Il caso che rende la copia utilizzabile da un secondo dispositivo: quel
     * che ha scritto un telefono deve arrivare all'altro.
     */
    public function test_un_secondo_dispositivo_riceve_le_modifiche(): void
    {
        $anna = $this->user();
        $change = $this->change();

        // Telefono A manda.
        $this->actingAs($anna)->postJson('/api/sync', ['changes' => [$change]]);

        // Telefono B, che non ha mai sincronizzato, chiede tutto.
        $response = $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => []]);

        $response->assertOk()
            ->assertJsonCount(1, 'changes')
            ->assertJsonPath('changes.0.id', $change['id'])
            ->assertJsonPath('changes.0.payload.name', 'Riso');
    }

    /**
     * Quel che un telefono ha appena mandato non gli torna indietro: e' gia'
     * suo, e rimandarglielo sarebbe traffico e una riscrittura inutile.
     */
    public function test_chi_manda_non_si_rivede_le_proprie_righe(): void
    {
        $anna = $this->user();
        $change = $this->change();

        $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => [$change]])
            ->assertOk()
            ->assertJsonCount(0, 'changes');
    }

    /**
     * Chi ha scritto per ultimo vince. "Ultimo" si misura sull'ora del
     * dispositivo, non su quella di arrivo: altrimenti un telefono rimasto
     * offline una settimana sovrascriverebbe modifiche piu' recenti solo
     * perche' si e' collegato dopo.
     */
    public function test_una_modifica_piu_vecchia_non_sovrascrive_una_piu_recente(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Riso integrale'],
                'updatedAt' => '2026-08-29T12:00:00+00:00',
            ])],
        ]);

        // Arriva dopo, ma e' stata scritta prima.
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Riso vecchio'],
                'updatedAt' => '2026-08-29T09:00:00+00:00',
            ])],
        ])->assertJsonPath('applied', 0);

        $this->assertSame(
            'Riso integrale',
            SyncRecord::firstOrFail()->payload['name'],
        );
    }

    public function test_una_modifica_piu_recente_sovrascrive(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'updatedAt' => '2026-08-29T09:00:00+00:00',
            ])],
        ]);
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Riso aggiornato'],
                'updatedAt' => '2026-08-29T12:00:00+00:00',
            ])],
        ])->assertJsonPath('applied', 1);

        $this->assertSame(1, SyncRecord::count());
        $this->assertSame(
            'Riso aggiornato',
            SyncRecord::firstOrFail()->payload['name'],
        );
    }

    /** Una cancellazione e' una modifica come le altre, e deve viaggiare. */
    public function test_una_cancellazione_arriva_agli_altri_dispositivi(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change(['id' => $id])],
        ]);
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'updatedAt' => '2026-08-29T11:00:00+00:00',
                'deletedAt' => '2026-08-29T11:00:00+00:00',
            ])],
        ]);

        $received = $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => []])
            ->json('changes');

        $this->assertCount(1, $received);
        $this->assertNotNull($received[0]['deletedAt']);
    }

    /**
     * Il segnaposto: la seconda sincronizzazione non riceve quel che aveva
     * gia' ricevuto. Senza, ogni giro riscriverebbe l'intero database.
     */
    public function test_il_cursore_evita_di_riscaricare_tutto(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change()],
        ]);

        $cursor = $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => []])
            ->json('cursor');

        $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => [], 'since' => $cursor])
            ->assertOk()
            ->assertJsonCount(0, 'changes');
    }

    /** I dati di una persona non finiscono mai nella copia di un'altra. */
    public function test_le_copie_di_due_persone_non_si_toccano(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change(['payload' => ['name' => 'Il riso di Anna']])],
        ]);

        $this->actingAs($bruno)
            ->postJson('/api/sync', ['changes' => []])
            ->assertOk()
            ->assertJsonCount(0, 'changes');
    }

    public function test_senza_account_non_si_sincronizza(): void
    {
        $this->postJson('/api/sync', ['changes' => []])->assertUnauthorized();
    }

    public function test_una_riga_malformata_viene_rifiutata(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [['table' => 'foods', 'id' => 'non-un-uuid']],
        ])->assertUnprocessable();

        $this->assertSame(0, SyncRecord::count());
    }
}
