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
}
