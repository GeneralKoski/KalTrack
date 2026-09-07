<?php

namespace Tests\Feature\Admin;

use App\Models\Exercise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminExerciseTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->create(['is_admin' => true]);
    }

    private function esercizio(array $attributi = []): Exercise
    {
        return Exercise::create([
            'uid' => 'ex-1',
            'name' => 'Panca piana',
            'name_norm' => 'panca piana',
            'muscle_group' => 'petto',
            'equipment' => 'bilanciere,panca',
            'status' => 'published',
            ...$attributi,
        ]);
    }

    public function test_l_elenco_filtra_per_gruppo_e_attrezzo(): void
    {
        $this->esercizio();
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat', 'muscle_group' => 'quadricipiti', 'equipment' => 'bilanciere']);

        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?muscleGroup=petto')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Panca piana');

        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?equipment=panca')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_l_elenco_trova_cio_che_manca(): void
    {
        $this->esercizio(['instructions' => 'Come si fa.']);
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat']);

        // E' il numero che la dashboard mostra e il filtro con cui si va a
        // colmarlo: 128 esercizi su 200 erano muti, e non c'era modo di
        // sapere quali.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?missing=instructions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Squat');
    }

    /**
     * Il filtro "cosa manca" e' ristretto al catalogo pubblicato, non alla
     * coda di revisione: una proposta ancora in attesa non e' un buco nel
     * catalogo, e' una riga con la sua schermata e una revisione da fare, non
     * una descrizione da scrivere.
     */
    public function test_il_filtro_cosa_manca_non_vede_le_proposte(): void
    {
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat', 'status' => 'pending']);
        $this->esercizio(['uid' => 'ex-3', 'name' => 'Affondi', 'name_norm' => 'affondi', 'status' => 'published']);

        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises?missing=instructions')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Affondi');
    }

    public function test_l_elenco_comprende_le_proposte(): void
    {
        $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat', 'status' => 'pending']);

        // Il gestionale vede tutto, e' il suo mestiere: la coda di revisione
        // e' una vista comoda sullo stesso insieme, non un insieme diverso.
        $this->actingAs($this->admin)
            ->getJson('/api/admin/exercises')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_si_crea_un_esercizio_gia_pubblicato(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/admin/exercises', [
                'name' => 'Rematore con bilanciere',
                'muscleGroup' => 'schiena',
                'equipment' => 'bilanciere',
                'instructions' => 'Busto a 45 gradi, il bilanciere sfiora le cosce.',
            ])
            ->assertCreated();

        $voce = Exercise::where('name_norm', 'rematore con bilanciere')->first();
        // Cio' che nasce dal gestionale e' gia' catalogo: chi lo scrive e'
        // la stessa persona che approverebbe.
        $this->assertSame('published', $voce->status);
        $this->assertNotNull($voce->uid);
    }

    public function test_si_corregge_la_descrizione(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$voce->id}", [
                'instructions' => 'Scapole addotte per tutta la serie.',
            ])
            ->assertOk();

        $this->assertSame('Scapole addotte per tutta la serie.', $voce->fresh()->instructions);
    }

    public function test_rinominare_addosso_a_un_altro_fallisce_leggibilmente(): void
    {
        $this->esercizio();
        $altro = $this->esercizio(['uid' => 'ex-2', 'name' => 'Squat', 'name_norm' => 'squat']);

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$altro->id}", ['name' => 'Panca piana'])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_l_uid_non_si_tocca_rinominando(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->patchJson("/api/admin/exercises/{$voce->id}", ['name' => 'Panca piana con bilanciere'])
            ->assertOk();

        // E' l'intero motivo per cui `uid` esiste: rinominare deve arrivare
        // sul telefono come una rinomina, non come una voce nuova.
        $this->assertSame('ex-1', $voce->fresh()->uid);
    }

    public function test_cancellare_e_morbido(): void
    {
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/exercises/{$voce->id}")
            ->assertOk();

        $this->assertNull(Exercise::find($voce->id));
        $this->assertNotNull(Exercise::withTrashed()->find($voce->id)->deleted_at);
    }

    public function test_si_carica_una_foto(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $r = $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", [
                'file' => UploadedFile::fake()->image('panca.jpg'),
            ])
            ->assertOk();

        $nome = $r->json('photo');
        $this->assertSame($nome, $voce->fresh()->photo);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_una_foto_nuova_toglie_la_vecchia(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $primo = $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", ['file' => UploadedFile::fake()->image('a.jpg')])
            ->json('photo');

        $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", ['file' => UploadedFile::fake()->image('b.jpg')])
            ->assertOk();

        // Senza, ogni correzione lascerebbe in cartella un file che nessuna
        // riga nomina piu': e' lo stesso difetto che `collectOrphanPhotos`
        // risolve sul telefono, ed e' piu' facile non crearlo.
        Storage::disk('local')->assertMissing("catalog/{$primo}");
    }

    public function test_la_foto_sopravvive_alla_cancellazione_morbida(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $nome = $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", ['file' => UploadedFile::fake()->image('panca.jpg')])
            ->json('photo');

        $this->actingAs($this->admin)
            ->deleteJson("/api/admin/exercises/{$voce->id}")
            ->assertOk();

        // La riga si puo' ripescare, quindi il file deve restare: cancellarlo
        // vorrebbe dire ripescare una voce senza la sua foto.
        $this->assertNotNull(Exercise::withTrashed()->find($voce->id)->deleted_at);
        Storage::disk('local')->assertExists("catalog/{$nome}");
    }

    public function test_un_file_che_non_e_un_immagine_non_entra(): void
    {
        Storage::fake('local');
        $voce = $this->esercizio();

        $this->actingAs($this->admin)
            ->post("/api/admin/exercises/{$voce->id}/photo", [
                'file' => UploadedFile::fake()->create('lista.pdf', 10, 'application/pdf'),
            ])
            ->assertStatus(422);
    }

    public function test_chi_non_e_amministratore_non_entra(): void
    {
        $anna = User::factory()->create();
        $voce = $this->esercizio();

        $this->actingAs($anna)->getJson('/api/admin/exercises')->assertForbidden();
        $this->actingAs($anna)->postJson('/api/admin/exercises', [])->assertForbidden();
        $this->actingAs($anna)->patchJson("/api/admin/exercises/{$voce->id}", [])->assertForbidden();
        $this->actingAs($anna)->deleteJson("/api/admin/exercises/{$voce->id}")->assertForbidden();
    }
}
