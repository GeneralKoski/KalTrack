<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Le scritture del catalogo si indirizzano per `uid`.
 *
 * Il telefono deve poter correggere e ritirare la propria proposta senza
 * tenersi in colonna un autoincrement di questo server: `uid` e' una stringa
 * stabile assegnata alla voce, e la stessa voce ha lo stesso uid per
 * chiunque. Le rotte vecchie `/api/exercises/{id}` restano per id.
 */
class CatalogWriteTest extends TestCase
{
    use RefreshDatabase;

    private function esercizio(array $over = []): array
    {
        return array_merge([
            'name' => 'Panca piana',
            'muscleGroup' => 'petto',
            'secondaryMuscles' => 'tricipiti',
            'equipment' => 'bilanciere,panca',
        ], $over);
    }

    /**
     * Senza `uid` nella risposta il telefono non sa cosa salvare in colonna, e
     * alla correzione successiva ricadrebbe sul nome - cioe' esattamente il
     * difetto che l'uid esiste per chiudere.
     */
    public function test_una_proposta_risponde_col_proprio_uid(): void
    {
        $anna = User::factory()->create();

        $risposta = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->assertOk();

        $uid = $risposta->json('data.uid');
        $this->assertNotEmpty($uid);
        $this->assertSame($uid, Exercise::where('name_norm', 'panca piana')->first()->uid);
    }

    public function test_si_corregge_la_propria_proposta_per_uid(): void
    {
        $anna = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($anna)
            ->patchJson("/api/catalog/exercises/{$uid}", $this->esercizio([
                'name' => 'Panca piana con bilanciere',
            ]))
            ->assertOk()
            ->assertJsonPath('data.uid', $uid);

        $this->assertSame(
            'Panca piana con bilanciere',
            Exercise::where('uid', $uid)->first()->name,
        );
    }

    public function test_si_ritira_la_propria_proposta_per_uid(): void
    {
        $anna = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($anna)
            ->deleteJson("/api/catalog/exercises/{$uid}")
            ->assertOk();

        $this->assertSoftDeleted('exercises', ['uid' => $uid]);
    }

    /** La stessa regola di prima, che il binding non deve aver allentato. */
    public function test_la_proposta_di_un_altro_resta_403(): void
    {
        $anna = User::factory()->create();
        $bea = User::factory()->create();
        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/exercises', $this->esercizio())
            ->json('data.uid');

        $this->actingAs($bea)
            ->patchJson("/api/catalog/exercises/{$uid}", $this->esercizio())
            ->assertStatus(403);
        $this->actingAs($bea)
            ->deleteJson("/api/catalog/exercises/{$uid}")
            ->assertStatus(403);
    }

    /** Un uid che non esiste e' un 404, non un 500 da binding mancato. */
    public function test_un_uid_sconosciuto_e_un_404(): void
    {
        $anna = User::factory()->create();

        $this->actingAs($anna)
            ->patchJson('/api/catalog/exercises/non-esiste', $this->esercizio())
            ->assertNotFound();
    }

    public function test_gli_alimenti_seguono_le_stesse_tre_regole(): void
    {
        $anna = User::factory()->create();
        $alimento = ['name' => 'Riso', 'kcal' => 358];

        $uid = $this->actingAs($anna)
            ->postJson('/api/catalog/foods', $alimento)
            ->assertOk()
            ->json('data.uid');
        $this->assertNotEmpty($uid);

        $this->actingAs($anna)
            ->patchJson("/api/catalog/foods/{$uid}", ['name' => 'Riso bianco', 'kcal' => 358])
            ->assertOk();
        $this->assertSame('Riso bianco', Food::where('uid', $uid)->first()->name);

        $this->actingAs($anna)->deleteJson("/api/catalog/foods/{$uid}")->assertOk();
        $this->assertSoftDeleted('foods', ['uid' => $uid]);
    }

    /** Le rotte vecchie restano per id: un telefono non aggiornato le usa. */
    public function test_le_rotte_vecchie_restano_indirizzate_per_id(): void
    {
        $anna = User::factory()->create();
        $this->actingAs($anna)->postJson('/api/exercises', $this->esercizio());
        $voce = Exercise::where('name_norm', 'panca piana')->first();

        $this->actingAs($anna)
            ->patchJson("/api/exercises/{$voce->id}", $this->esercizio([
                'name' => 'Panca',
            ]))
            ->assertOk();
    }
}
