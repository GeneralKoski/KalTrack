<?php

namespace Tests\Feature;

use App\Models\EquipmentType;
use App\Models\MuscleGroup;
use Database\Seeders\TaxonomySeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxonomyTest extends TestCase
{
    use RefreshDatabase;

    public function test_il_seeder_popola_gruppi_e_attrezzi(): void
    {
        $this->seed(TaxonomySeeder::class);

        $this->assertSame(12, MuscleGroup::count());
        $this->assertSame(11, EquipmentType::count());

        $petto = MuscleGroup::where('slug', 'petto')->first();
        $this->assertSame('Petto', $petto->label_it);
        $this->assertSame('Chest', $petto->label_en);
    }

    public function test_il_seeder_e_idempotente(): void
    {
        $this->seed(TaxonomySeeder::class);
        $this->seed(TaxonomySeeder::class);

        $this->assertSame(12, MuscleGroup::count());
        $this->assertSame(11, EquipmentType::count());
    }

    public function test_uno_slug_non_si_ripete(): void
    {
        MuscleGroup::create(['slug' => 'petto', 'label_it' => 'Petto', 'label_en' => 'Chest']);

        $this->expectException(QueryException::class);
        MuscleGroup::create(['slug' => 'petto', 'label_it' => 'Altro', 'label_en' => 'Other']);
    }

    /**
     * Quarta istanza della regola 7: l'indice unico su `slug` copre anche le
     * righe cancellate. Senza `withTrashed()` nel lookup, `firstOrCreate` non
     * vede uno slug cancellato dal gestionale - e' invisibile sotto lo scope
     * globale di `SoftDeletes` - e la `create` che segue va a sbattere contro
     * quello stesso indice con una `QueryException` non gestita: il seed che
     * la sua stessa docblock dichiara idempotente si romperebbe al primo
     * riavvio dopo che un amministratore ha tolto una voce.
     */
    public function test_il_seeder_non_si_rompe_su_uno_slug_cancellato(): void
    {
        $this->seed(TaxonomySeeder::class);
        MuscleGroup::where('slug', 'petto')->first()->delete();

        $this->seed(TaxonomySeeder::class);

        $this->assertTrue(true); // Non deve lanciare: e' tutta la verifica.
    }

    /**
     * Chi ha cancellato una voce lo ha deciso apposta: il seed non la
     * resuscita, la stessa regola per cui `SeedCatalog` non riporta indietro
     * un esercizio o un alimento tolto dal gestionale.
     */
    public function test_il_seeder_non_resuscita_uno_slug_cancellato(): void
    {
        $this->seed(TaxonomySeeder::class);
        MuscleGroup::where('slug', 'petto')->first()->delete();

        $this->seed(TaxonomySeeder::class);

        $this->assertNull(MuscleGroup::where('slug', 'petto')->first());
        $this->assertNotNull(MuscleGroup::withTrashed()->where('slug', 'petto')->first());
    }
}
