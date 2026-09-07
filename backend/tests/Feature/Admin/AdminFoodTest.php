<?php

namespace Tests\Feature\Admin;

use App\Models\Food;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminFoodTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
    }

    private function alimento(array $attributi = []): Food
    {
        return Food::create([
            'uid' => 'f-1',
            'name' => 'Pasta di semola cruda',
            'name_norm' => 'pasta di semola cruda',
            'kcal' => 353,
            'protein' => 10.9,
            'carbs' => 71.2,
            'fat' => 1.4,
            'status' => 'published',
            ...$attributi,
        ]);
    }

    public function test_si_crea_un_alimento_completo(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/foods', [
                'name' => 'Yogurt greco 0%',
                'brand' => 'Fage',
                'barcode' => '5201054000000',
                'kcal' => 57,
                'protein' => 10.3,
                'carbs' => 3.6,
                'sugars' => 3.6,
                'fat' => 0.0,
                'saturatedFat' => 0.0,
                'fiber' => 0.0,
                'salt' => 0.1,
                'isLiquid' => false,
                'defaultServingG' => 170,
                'servingLabel' => '1 vasetto = 170 g',
            ])
            ->assertCreated();

        $voce = Food::where('name_norm', 'yogurt greco 0')->first();
        $this->assertNotNull($voce);
        $this->assertSame('published', $voce->status);
        $this->assertSame('5201054000000', $voce->barcode);
        $this->assertEqualsWithDelta(170.0, $voce->default_serving_g, 0.01);
    }

    public function test_si_cerca_per_codice_a_barre(): void
    {
        $this->alimento(['uid' => 'f-2', 'name' => 'Pasta Lidl', 'name_norm' => 'pasta lidl', 'barcode' => '4056489012345']);

        // E' l'identita' esatta di un prodotto: due voci con lo stesso codice
        // sono lo stesso prodotto, ed e' cosi' che si trova il doppione che
        // il nome da solo non farebbe vedere.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/foods?barcode=4056489012345')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Pasta Lidl');
    }

    public function test_si_correggono_i_valori(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$voce->id}", ['kcal' => 350, 'salt' => 0.02])
            ->assertOk();

        $voce->refresh();
        $this->assertEqualsWithDelta(350.0, $voce->kcal, 0.01);
        $this->assertEqualsWithDelta(0.02, $voce->salt, 0.001);
        // Cio' che non e' arrivato non si azzera: da web si corregge un campo
        // alla volta, e una PATCH parziale che svuota il resto sarebbe un
        // modo silenzioso di rovinare una voce.
        $this->assertEqualsWithDelta(10.9, $voce->protein, 0.01);
    }

    public function test_rinominare_addosso_a_un_altro_fallisce_leggibilmente(): void
    {
        $this->alimento();
        $altro = $this->alimento(['uid' => 'f-2', 'name' => 'Riso', 'name_norm' => 'riso']);

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$altro->id}", ['name' => 'Pasta di semola cruda'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    /**
     * Gemello di `AdminExerciseTest::test_ricreare_col_nome_di_uno_cancellato_lo_fa_tornare`,
     * per gli alimenti: stessa identita' sul nome, stessa via d'uscita per un
     * amministratore che ha cancellato per sbaglio.
     */
    public function test_ricreare_col_nome_di_uno_cancellato_lo_fa_tornare(): void
    {
        $voce = $this->alimento();
        $vecchioId = $voce->id;
        $voce->delete();

        $this->actingAs($this->admin)
            ->postJson('/api/admin/foods', [
                'name' => 'Pasta di semola cruda',
                'kcal' => 360,
                'protein' => 11,
            ])
            ->assertCreated();

        $risuscitata = Food::where('name_norm', 'pasta di semola cruda')->first();
        $this->assertNotNull($risuscitata);
        $this->assertNull($risuscitata->deleted_at);
        $this->assertSame($vecchioId, $risuscitata->id);
        $this->assertSame('f-1', $risuscitata->uid);
        $this->assertEqualsWithDelta(360.0, $risuscitata->kcal, 0.01);
        $this->assertSame(1, Food::withTrashed()->count());
    }

    public function test_cancellare_e_morbido(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/foods/{$voce->id}")
            ->assertOk();

        $this->assertNull(Food::find($voce->id));
        $this->assertNotNull(Food::withTrashed()->find($voce->id)->deleted_at);
    }

    public function test_si_carica_un_immagine(): void
    {
        Storage::fake('local');
        $voce = $this->alimento();

        $r = $this->actingAs($this->admin)
            ->post("/api/admin/foods/{$voce->id}/image", [
                'file' => UploadedFile::fake()->image('pasta.jpg'),
            ])
            ->assertOk();

        $nome = $r->json('image');
        $this->assertSame($nome, $voce->fresh()->image);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_l_immagine_sopravvive_alla_cancellazione_morbida(): void
    {
        Storage::fake('local');
        $voce = $this->alimento();

        $nome = $this->actingAs($this->admin)
            ->post("/api/admin/foods/{$voce->id}/image", ['file' => UploadedFile::fake()->image('pasta.jpg')])
            ->json('image');

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/foods/{$voce->id}")
            ->assertOk();

        // La riga si puo' ripescare, quindi il file deve restare: cancellarlo
        // vorrebbe dire ripescare una voce senza la sua immagine.
        $this->assertNotNull(Food::withTrashed()->find($voce->id)->deleted_at);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_kcal_e_obbligatorio_in_creazione(): void
    {
        // La colonna ha `default 0`: un alimento creato senza kcal non
        // sarebbe salvato come "sconosciuto" ma come zero calorie, un
        // numero che sembra vero e non lo e'.
        $this->actingAs($this->admin)
            ->postJson('/api/admin/foods', [
                'name' => 'Alimento senza calorie',
                'protein' => 5,
            ])
            ->assertStatus(422);
    }

    public function test_i_valori_negativi_non_entrano(): void
    {
        $voce = $this->alimento();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/foods/{$voce->id}", ['kcal' => -10])
            ->assertStatus(422);
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $anna = User::factory()->create();
        $voce = $this->alimento();

        $this->actingAs($anna)->getJson('/api/admin/foods')->assertForbidden();
        $this->actingAs($anna)->patchJson("/api/admin/foods/{$voce->id}", [])->assertForbidden();
    }
}
