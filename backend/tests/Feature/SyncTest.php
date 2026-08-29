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

        // Manca tutto tranne la tabella: senza payload e senza date non c'e'
        // niente da scrivere.
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [['table' => 'foods', 'id' => 'qualcosa']],
        ])->assertUnprocessable();

        $this->assertSame(0, SyncRecord::count());
    }

    /**
     * Il difetto che questo test blocca: la validazione voleva un uuid, ma i
     * tipi di pasto hanno id parlanti ("mt-lunch") e le impostazioni usano la
     * loro chiave. Bastava una di quelle righe perche' l'INTERA
     * sincronizzazione venisse rifiutata con un 422.
     */
    public function test_accetta_gli_id_che_non_sono_uuid(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [
                $this->change(['table' => 'meal_types', 'id' => 'mt-lunch']),
                $this->change(['table' => 'settings', 'id' => 'sync.cursor']),
            ],
        ])->assertOk()->assertJsonPath('applied', 2);
    }

    /**
     * IL DIFETTO PIU' GRAVE TROVATO. Prima: la pull sopprimeva TUTTE le righe
     * inviate, anche quelle che il server aveva rifiutato perche' piu'
     * vecchie. Il telefono non riceveva mai la versione buona, il cursore
     * avanzava oltre, e quella riga divergeva per sempre - proprio la riga che
     * aveva avuto un conflitto, cioe' il caso che la regola "chi scrive per
     * ultimo vince" doveva risolvere.
     */
    public function test_chi_perde_il_confronto_riceve_indietro_la_versione_buona(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        // Il telefono B ha gia' mandato la versione delle 10:05.
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Versione di B'],
                'updatedAt' => '2026-08-29T10:05:00+00:00',
            ])],
        ]);

        // Il telefono A manda la sua, piu' vecchia: viene rifiutata, ma nella
        // stessa risposta deve tornargli indietro quella di B.
        $response = $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Versione di A'],
                'updatedAt' => '2026-08-29T10:00:00+00:00',
            ])],
        ]);

        $response->assertOk()->assertJsonPath('applied', 0);
        $response->assertJsonCount(1, 'changes');
        $response->assertJsonPath('changes.0.payload.name', 'Versione di B');
    }

    /**
     * Il pareggio: stesso `updated_at`, contenuti diversi. Il server tiene
     * quel che ha, e chi ha perso deve comunque ricevere indietro la copia
     * buona invece di restare con la propria.
     */
    public function test_anche_a_parita_di_ora_la_copia_del_server_torna_indietro(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();
        $ora = '2026-08-29T10:00:00+00:00';

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Primo arrivato'],
                'updatedAt' => $ora,
            ])],
        ]);

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Secondo arrivato'],
                'updatedAt' => $ora,
            ])],
        ])->assertJsonPath('changes.0.payload.name', 'Primo arrivato');
    }

    /**
     * Il secondo blocker: due dispositivi che sincronizzano nello STESSO
     * secondo. Con un cursore basato su `synced_at`, che ha precisione al
     * secondo, le righe del secondo dispositivo cadevano fuori dalla finestra
     * e nessuna pull successiva le avrebbe piu' viste.
     */
    public function test_due_sincronizzazioni_nello_stesso_secondo_non_perdono_righe(): void
    {
        $anna = $this->user();

        // A sincronizza a vuoto e memorizza il cursore.
        $cursore = $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => []])
            ->json('cursor');

        // B scrive nello stesso identico secondo.
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change(['payload' => ['name' => 'Scritta da B']])],
        ]);

        // A riprende dal suo cursore: la riga di B deve esserci.
        $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => [], 'since' => $cursore])
            ->assertOk()
            ->assertJsonCount(1, 'changes')
            ->assertJsonPath('changes.0.payload.name', 'Scritta da B');
    }

    /**
     * Una riga MODIFICATA deve ripropagarsi. Con `synced_at`, che non veniva
     * riscritto sugli aggiornamenti, restava ferma al suo primo arrivo e gli
     * altri dispositivi non vedevano mai la modifica.
     */
    public function test_una_riga_modificata_torna_visibile_agli_altri(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'updatedAt' => '2026-08-29T09:00:00+00:00',
            ])],
        ]);

        $cursore = $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => []])
            ->json('cursor');

        // La stessa riga cambia.
        $this->actingAs($anna)->postJson('/api/sync', [
            'changes' => [$this->change([
                'id' => $id,
                'payload' => ['name' => 'Cambiata'],
                'updatedAt' => '2026-08-29T12:00:00+00:00',
            ])],
        ]);

        $this->actingAs($anna)
            ->postJson('/api/sync', ['changes' => [], 'since' => $cursore])
            ->assertJsonCount(1, 'changes')
            ->assertJsonPath('changes.0.payload.name', 'Cambiata');
    }
    /**
     * Il difetto: le ore si salvavano troncate al secondo. Due modifiche fatte
     * nello stesso secondo su due telefoni diventavano pari, e a quel punto
     * passava l'ultima ARRIVATA invece dell'ultima scritta.
     */
    public function test_due_scritture_nello_stesso_secondo_le_distingue_il_millesimo(): void
    {
        $anna = $this->user();
        $id = (string) Str::uuid();

        // Il telefono A scrive a fine secondo.
        $this->actingAs($anna)->postJson('/api/sync', ['changes' => [
            $this->change([
                'id' => $id,
                'payload' => ['name' => 'Riso integrale'],
                'updatedAt' => '2026-08-29T10:00:00.900+00:00',
            ]),
        ]])->assertOk();

        // Il telefono B, con una copia PIU' VECCHIA dello stesso secondo,
        // arriva dopo. Non deve vincere.
        $risposta = $this->actingAs($anna)->postJson('/api/sync', ['changes' => [
            $this->change([
                'id' => $id,
                'payload' => ['name' => 'Riso bianco'],
                'updatedAt' => '2026-08-29T10:00:00.100+00:00',
            ]),
        ]])->assertOk();

        $risposta->assertJsonPath('applied', 0);
        $this->assertSame('Riso integrale', SyncRecord::firstOrFail()->payload['name']);

        // E la copia buona torna indietro a chi ha perso, altrimenti i due
        // telefoni resterebbero diversi per sempre.
        $risposta->assertJsonPath('changes.0.payload.name', 'Riso integrale');
    }

    /**
     * La busta usciva arrotondata al secondo mentre il payload aveva i
     * millesimi. Il telefono decide chi vince guardando queste ore: un
     * dispositivo che si fida della busta non distingue due scritture dello
     * stesso secondo.
     */
    public function test_le_ore_che_tornano_hanno_i_millesimi(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)->postJson('/api/sync', ['changes' => [
            $this->change(['updatedAt' => '2026-08-29T10:00:00.250+00:00']),
        ]])->assertOk();

        // Un secondo dispositivo, che non ha mandato niente, se la prende.
        $this->actingAs($anna)->postJson('/api/sync', ['since' => 0, 'changes' => []])
            ->assertOk()
            ->assertJsonPath('changes.0.updatedAt', '2026-08-29T10:00:00.250+00:00');
    }

}
