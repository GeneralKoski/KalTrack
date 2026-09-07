<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Food;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CatalogSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_esercizio_esistente_nasce_pubblicato_e_con_un_uid(): void
    {
        $e = Exercise::create([
            'name' => 'Panca piana',
            'name_norm' => 'panca piana',
            'muscle_group' => 'petto',
            'uid' => 'ex-panca-piana',
        ]);

        $this->assertSame('published', $e->fresh()->status);
        $this->assertSame('ex-panca-piana', $e->fresh()->uid);
    }

    public function test_le_righe_di_prima_della_migrazione_sono_pubblicate(): void
    {
        /*
         * Le voci che c'erano prima erano gia' catalogo vivo: nascere
         * `pending` le nasconderebbe a tutti quelli che le usano.
         *
         * Si scrivono con il query builder per aggirare i default del model,
         * cioe' per somigliare a una riga scritta dal codice di ieri.
         */
        $id = DB::table('exercises')->insertGetId([
            'name' => 'Vecchio', 'name_norm' => 'vecchio', 'muscle_group' => 'petto',
            'uid' => 'vecchio', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame('published', Exercise::find($id)->status);
    }

    public function test_un_esercizio_si_cancella_in_modo_morbido(): void
    {
        $e = Exercise::create([
            'name' => 'Rematore',
            'name_norm' => 'rematore',
            'muscle_group' => 'schiena',
            'uid' => 'ex-rematore',
        ]);

        $e->delete();

        $this->assertNull(Exercise::find($e->id));
        $this->assertNotNull(Exercise::withTrashed()->find($e->id)->deleted_at);
    }

    public function test_un_alimento_esistente_nasce_pubblicato_e_con_un_uid(): void
    {
        $f = Food::create([
            'name' => 'Pasta di semola cruda',
            'name_norm' => 'pasta di semola cruda',
            'uid' => 'seed-pasta-semola-cruda',
            'kcal' => 353,
        ]);

        $this->assertSame('published', $f->fresh()->status);
        $this->assertSame('seed-pasta-semola-cruda', $f->fresh()->uid);
    }

    public function test_un_alimento_porta_codice_a_barre_e_provenienza(): void
    {
        $f = Food::create([
            'name' => 'Pasta Lidl',
            'name_norm' => 'pasta lidl',
            'uid' => 'x-1',
            'barcode' => '4056489012345',
            'off_id' => '4056489012345',
        ]);

        $this->assertSame('4056489012345', $f->fresh()->barcode);
        $this->assertSame('4056489012345', $f->fresh()->off_id);
    }
}
