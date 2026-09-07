<?php

namespace Tests\Feature;

use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\Food;
use App\Models\MuscleGroup;
use App\Support\Text;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

class SeedCatalogTest extends TestCase
{
    use RefreshDatabase;

    public function test_carica_il_catalogo_come_pubblicato(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        $panca = Exercise::where('uid', 'ex-panca-piana-bilanciere')->first();

        $this->assertNotNull($panca);
        $this->assertSame('published', $panca->status);
        $this->assertSame('petto', $panca->muscle_group);
        $this->assertNotEmpty($panca->instructions);
        // Gli elenchi viaggiano separati da virgole, come in colonna.
        $this->assertStringContainsString('bilanciere', $panca->equipment);
        // Nessun autore: il seed non e' di nessuno.
        $this->assertNull($panca->created_by);
    }

    public function test_e_idempotente(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();
        $primo = Exercise::count();
        $primoCibo = Food::count();

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertSame($primo, Exercise::count());
        $this->assertSame($primoCibo, Food::count());
    }

    public function test_non_riscrive_una_voce_gia_corretta(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        Exercise::where('uid', 'ex-panca-piana-bilanciere')
            ->update(['instructions' => 'Istruzione corretta a mano.']);

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertSame(
            'Istruzione corretta a mano.',
            Exercise::where('uid', 'ex-panca-piana-bilanciere')->first()->instructions,
        );
    }

    public function test_non_riporta_indietro_una_voce_cancellata(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        Exercise::where('uid', 'ex-panca-piana-bilanciere')->first()->delete();

        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertNull(Exercise::where('uid', 'ex-panca-piana-bilanciere')->first());
    }

    public function test_carica_anche_gli_alimenti(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        $pasta = Food::where('uid', 'seed-pasta-semola-cruda')->first();

        $this->assertNotNull($pasta);
        $this->assertSame('published', $pasta->status);
        $this->assertEqualsWithDelta(353.0, $pasta->kcal, 0.01);
    }

    /**
     * Il comando che carica le costanti dell'app nel server carica anche le
     * tassonomie: senza questa riga, `muscle_groups` e `equipment_types`
     * restavano a zero righe su ogni deploy reale, perche' l'unico posto che
     * chiamava `TaxonomySeeder` era `DatabaseSeeder`, che l'entrypoint del
     * container non lancia mai (crea anche uno "Test User").
     */
    public function test_carica_anche_le_tassonomie(): void
    {
        $this->artisan('catalog:seed')->assertSuccessful();

        $this->assertSame(12, MuscleGroup::count());
        $this->assertSame(11, EquipmentType::count());
        $this->assertNotNull(MuscleGroup::where('slug', 'petto')->first());
    }

    /**
     * `catalog:seed` scartava per `uid` mentre il vincolo unico del database
     * e' su `name_norm`: una voce esterna al seed - una proposta approvata, o
     * una voce scritta a mano dal gestionale - il cui nome normalizzato
     * combacia con una voce di seed sotto un `uid` diverso mandava in crash
     * `Exercise::create()` a meta' giro, e l'entrypoint la inghiottiva in
     * silenzio (`|| true`) lasciando il container con un catalogo a meta'.
     * Ora si scarta anche per nome, il comando completa, e il resto del seed
     * entra comunque.
     */
    public function test_salta_una_voce_il_cui_nome_e_gia_in_catalogo_sotto_un_altro_uid(): void
    {
        Log::spy();

        Exercise::create([
            'uid' => 'un-uid-diverso',
            'name' => 'Panca piana con bilanciere',
            'name_norm' => Text::normalize('Panca piana con bilanciere'),
            'muscle_group' => 'petto',
            'status' => 'published',
        ]);

        $this->artisan('catalog:seed')->assertSuccessful();

        // Scartata: l'uid del seed non e' entrato, quello che c'era resta.
        $this->assertNull(Exercise::where('uid', 'ex-panca-piana-bilanciere')->first());
        $this->assertNotNull(Exercise::where('uid', 'un-uid-diverso')->first());
        // Il resto del catalogo e' entrato lo stesso: 200 del seed meno
        // quella scartata, piu' la riga gia' presente.
        $this->assertSame(200, Exercise::count());

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $messaggio) => str_contains($messaggio, 'saltato'))
            ->once();
    }
}
