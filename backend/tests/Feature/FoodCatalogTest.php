<?php

namespace Tests\Feature;

use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Il catalogo degli alimenti, comune a tutti gli iscritti.
 *
 * Gemello di quello degli esercizi e con le stesse regole. Vale la pena
 * ripetere i test invece di rimandare all'altro file: sono due elenchi che si
 * possono toccare separatamente, e il giorno in cui uno dei due perdesse il
 * controllo di proprieta' nessuno se ne accorgerebbe da qui.
 */
class FoodCatalogTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle = 'anna'): User
    {
        $user = User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
        ]);

        return $user->refresh();
    }

    private function alimento(array $over = []): array
    {
        return [
            'name' => 'Petto di pollo',
            'kcal' => 165,
            'protein' => 31,
            'carbs' => 0,
            'fat' => 3.6,
            ...$over,
        ];
    }

    public function test_aggiunge_un_alimento_al_catalogo(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento())
            ->assertOk()
            ->assertJsonPath('data.name', 'Petto di pollo')
            ->assertJsonPath('data.kcal', 165)
            ->assertJsonPath('data.protein', 31)
            ->assertJsonPath('data.mine', true);

        $this->assertSame(1, Food::count());
    }

    public function test_due_nomi_uguali_a_meno_delle_maiuscole_restano_una_riga(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $this->actingAs($anna)->postJson('/api/foods', $this->alimento())->assertOk();
        $this->actingAs($bea)->postJson('/api/foods', $this->alimento([
            'name' => 'petto  di  POLLO',
            'kcal' => 999,
        ]))->assertOk();

        $this->assertSame(1, Food::count());
        // Vince chi ha scritto per primo, valori compresi: il secondo non
        // sovrascrive in silenzio l'alimento di un altro.
        $this->assertSame('Petto di pollo', Food::first()->name);
        $this->assertSame(165.0, Food::first()->kcal);
    }

    public function test_il_catalogo_non_dice_chi_ha_aggiunto_cosa(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $this->actingAs($anna)->postJson('/api/foods', $this->alimento())->assertOk();

        $corpo = $this->actingAs($bea)
            ->getJson('/api/foods')
            ->assertOk()
            ->json('data.0');

        $this->assertArrayNotHasKey('createdBy', $corpo);
        $this->assertArrayNotHasKey('created_by', $corpo);
        $this->assertFalse($corpo['mine']);

        // In colonna c'e', ed e' quel che rende possibile "il mio".
        $this->assertSame($anna->id, Food::first()->created_by);
    }

    public function test_correggo_un_alimento_mio(): void
    {
        $anna = $this->user();
        $id = $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento(['kcal' => 999]))
            ->json('data.id');

        $this->actingAs($anna)
            ->patchJson("/api/foods/{$id}", $this->alimento())
            ->assertOk()
            ->assertJsonPath('data.kcal', 165);

        $this->assertSame(165.0, Food::find($id)->kcal);
    }

    public function test_cancello_un_alimento_mio(): void
    {
        $anna = $this->user();
        $id = $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento())
            ->json('data.id');

        $this->actingAs($anna)->deleteJson("/api/foods/{$id}")->assertOk();

        $this->assertSame(0, Food::count());
    }

    /**
     * Un alimento sbagliato nel catalogo di tutti falsa i diari di tutti: e'
     * la ragione per cui esiste la correzione, ed e' anche la ragione per cui
     * non puo' farla chiunque.
     */
    public function test_non_tocco_l_alimento_di_un_altro(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $id = $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento())
            ->json('data.id');

        $this->actingAs($bea)
            ->patchJson("/api/foods/{$id}", $this->alimento(['kcal' => 10]))
            ->assertStatus(403);

        $this->actingAs($bea)->deleteJson("/api/foods/{$id}")->assertStatus(403);

        $this->assertSame(165.0, Food::find($id)->kcal);
    }

    public function test_un_alimento_senza_autore_non_lo_tocca_nessuno(): void
    {
        $anna = $this->user();
        $orfano = Food::create([
            'name' => 'Voce antica',
            'name_norm' => 'voce antica',
            'kcal' => 100,
        ]);

        $this->actingAs($anna)
            ->deleteJson("/api/foods/{$orfano->id}")
            ->assertStatus(403);

        $this->assertSame(1, Food::count());
    }

    public function test_si_cerca_per_nome(): void
    {
        $anna = $this->user();

        foreach (['Petto di pollo', 'Petto di tacchino', 'Riso'] as $nome) {
            $this->actingAs($anna)
                ->postJson('/api/foods', $this->alimento(['name' => $nome]))
                ->assertOk();
        }

        $this->actingAs($anna)
            ->getJson('/api/foods?q=petto')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    /**
     * Nessun alimento supera le mille calorie per etto e nessun macro passa i
     * cento grammi: un valore fuori scala nel catalogo di tutti e' un diario
     * sballato per chiunque lo usi.
     */
    public function test_i_valori_fuori_scala_non_entrano(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento(['kcal' => 5000]))
            ->assertStatus(422);

        $this->actingAs($anna)
            ->postJson('/api/foods', $this->alimento(['protein' => 500]))
            ->assertStatus(422);

        $this->assertSame(0, Food::count());
    }

    public function test_senza_accesso_il_catalogo_non_si_vede(): void
    {
        $this->getJson('/api/foods')->assertStatus(401);
        $this->postJson('/api/foods', $this->alimento())->assertStatus(401);
    }
}
