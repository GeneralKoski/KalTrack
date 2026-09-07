<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use App\Support\Text;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
     * verificare da fuori: `created_by` non deve uscire dal pull, nemmeno
     * per una voce che l'account che legge non ha scritto lui.
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
        $this->assertArrayNotHasKey('created_by', $corpo);
        $this->assertArrayNotHasKey('createdBy', $corpo);
    }
}
