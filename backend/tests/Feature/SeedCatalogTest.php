<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
