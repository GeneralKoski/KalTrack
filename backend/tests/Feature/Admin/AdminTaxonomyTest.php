<?php

namespace Tests\Feature\Admin;

use App\Models\EquipmentType;
use App\Models\Exercise;
use App\Models\MuscleGroup;
use App\Models\User;
use Database\Seeders\TaxonomySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTaxonomyTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
        $this->seed(TaxonomySeeder::class);
    }

    public function test_l_elenco_esce_ordinato(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/taxonomies/muscle-groups')
            ->assertOk()
            ->assertJsonCount(12, 'data')
            ->assertJsonPath('data.0.slug', 'petto');
    }

    public function test_si_aggiunge_un_gruppo(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/muscle-groups', [
                'slug' => 'ischiocrurali',
                'labelIt' => 'Ischiocrurali',
                'labelEn' => 'Hamstrings',
                'sort' => 95,
            ])
            ->assertCreated();

        $this->assertNotNull(MuscleGroup::where('slug', 'ischiocrurali')->first());
    }

    public function test_uno_slug_si_scrive_solo_una_volta(): void
    {
        $petto = MuscleGroup::where('slug', 'petto')->first();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/taxonomies/muscle-groups/{$petto->id}", [
                'slug' => 'torace',
                'labelIt' => 'Torace',
                'labelEn' => 'Chest',
            ])
            ->assertOk();

        /*
         * L'etichetta cambia, lo slug no.
         *
         * Lo slug e' quel che sta scritto in colonna su ogni esercizio:
         * cambiarlo lascerebbe orfani tutti gli esercizi del petto, sul
         * server e su ogni telefono, senza che niente lo dica. Rinominare e'
         * un fatto sull'etichetta.
         */
        $petto->refresh();
        $this->assertSame('petto', $petto->slug);
        $this->assertSame('Torace', $petto->label_it);
    }

    public function test_uno_slug_gia_preso_non_si_riusa(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/muscle-groups', [
                'slug' => 'petto',
                'labelIt' => 'Altro petto',
                'labelEn' => 'Other chest',
            ])
            ->assertStatus(422);
    }

    public function test_uno_slug_si_normalizza(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/taxonomies/equipment', [
                'slug' => 'Lat Machine',
                'labelIt' => 'Lat machine',
                'labelEn' => 'Lat pulldown',
            ])
            ->assertCreated();

        // Uno slug con spazi e maiuscole finirebbe in colonna cosi' com'e' e
        // non combacerebbe mai con quel che l'app si aspetta.
        $this->assertNotNull(EquipmentType::where('slug', 'lat_machine')->first());
    }

    public function test_non_si_cancella_un_gruppo_ancora_usato(): void
    {
        Exercise::create([
            'uid' => 'x', 'name' => 'Panca', 'name_norm' => 'panca',
            'muscle_group' => 'petto', 'status' => 'published',
        ]);
        $petto = MuscleGroup::where('slug', 'petto')->first();

        /*
         * Cancellandolo, ogni esercizio del petto resterebbe con uno slug che
         * non ha piu' un'etichetta. Il pull lo manda comunque come tombstone
         * e l'app ha una ricaduta, ma un elenco di esercizi senza gruppo e'
         * un danno che si puo' evitare chiedendo prima di spostarli.
         */
        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/muscle-groups/{$petto->id}")
            ->assertStatus(422)
            ->assertJsonPath('errors.slug.0', 'Ci sono ancora 1 voci che lo usano.');
    }

    public function test_si_cancella_un_gruppo_non_usato(): void
    {
        $polpacci = MuscleGroup::where('slug', 'polpacci')->first();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/muscle-groups/{$polpacci->id}")
            ->assertOk();

        $this->assertNull(MuscleGroup::find($polpacci->id));
    }

    public function test_il_corpo_libero_non_si_cancella(): void
    {
        $cl = EquipmentType::where('slug', 'corpo_libero')->first();

        // `EquipmentScreen` lo dichiara sempre presente e
        // `listAvailableEquipment` ragiona per esclusione a partire da li':
        // toglierlo cambierebbe il significato di ogni dichiarazione di
        // attrezzatura gia' fatta.
        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/equipment/{$cl->id}")
            ->assertStatus(422);
    }

    public function test_un_tipo_sconosciuto_non_esiste(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/admin/taxonomies/colori')
            ->assertNotFound();
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/admin/taxonomies/muscle-groups')
            ->assertForbidden();
    }

    public function test_un_underscore_nello_slug_non_e_un_jolly(): void
    {
        /*
         * `_` e' un jolly di LIKE: senza fuga, lo slug "lat_machine" (con
         * l'underscore) combacerebbe anche con la colonna "latXmachine" (con
         * una X al suo posto), che nomina un attrezzo tutto diverso. Questo
         * esercizio non usa affatto "lat_machine", ma un controllo senza fuga
         * lo conterebbe come se lo usasse e rifiuterebbe la cancellazione.
         */
        $latMachine = EquipmentType::create([
            'slug' => 'lat_machine', 'label_it' => 'Lat machine', 'label_en' => 'Lat pulldown', 'sort' => 200,
        ]);
        Exercise::create([
            'uid' => 'z', 'name' => 'Test', 'name_norm' => 'test',
            'muscle_group' => 'petto', 'equipment' => 'latXmachine',
            'status' => 'published',
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/taxonomies/equipment/{$latMachine->id}")
            ->assertOk();

        $this->assertNull(EquipmentType::find($latMachine->id));
    }
}
