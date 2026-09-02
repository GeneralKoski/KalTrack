<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * I byte delle foto.
 *
 * La sincronizzazione copia le righe, e una riga con foto contiene solo un
 * percorso: senza questi endpoint, sull'altro telefono resta un rettangolo
 * vuoto e nessuno spiega perche'.
 */
class ImageTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle): User
    {
        return User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
        ]);
    }

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_una_foto_caricata_si_riscarica(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => 'recipe-abc.jpg',
            'file' => UploadedFile::fake()->image('scatto.jpg'),
        ])->assertCreated();

        $this->actingAs($anna)
            ->get('/api/images/recipe-abc.jpg')
            ->assertOk();
    }

    public function test_l_elenco_dice_al_telefono_cosa_non_serve_rimandare(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => 'gia-caricata.jpg',
            'file' => UploadedFile::fake()->image('x.jpg'),
        ])->assertCreated();

        $this->actingAs($anna)
            ->getJson('/api/images')
            ->assertOk()
            ->assertJsonPath('names.0', 'gia-caricata.jpg');
    }

    /**
     * Sono le foto dei progressi di qualcuno. Che il vicino non le veda e'
     * l'unica cosa che conta davvero di questo controller.
     */
    public function test_le_foto_di_un_altro_non_si_scaricano(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => 'privata.jpg',
            'file' => UploadedFile::fake()->image('x.jpg'),
        ])->assertCreated();

        // Bruno conosce il nome esatto e ha un account valido: non basta.
        $this->actingAs($bruno)
            ->get('/api/images/privata.jpg')
            ->assertNotFound();
    }

    public function test_senza_account_non_si_scarica_niente(): void
    {
        $anna = $this->user('anna');
        // Il file si mette sul disco a mano, senza passare da actingAs:
        // autenticarsi per caricarlo lascerebbe la sessione aperta anche per
        // la richiesta dopo, e il test direbbe di sì a chiunque.
        Storage::disk('local')->put("images/{$anna->id}/privata.jpg", 'byte');

        $this->getJson('/api/images/privata.jpg')->assertUnauthorized();
    }

    /**
     * Il nome finisce in un percorso su disco. Senza il controllo, un `../`
     * ci farebbe leggere e scrivere fuori dalla cartella dell'utente.
     */
    public function test_un_nome_che_risale_le_cartelle_viene_rifiutato(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => '../../../.env',
            'file' => UploadedFile::fake()->image('x.jpg'),
        ])->assertStatus(422);
    }

    /**
     * `..` da solo passava il regex: non contiene `/`, quindi la traversata
     * vera resta esclusa, ma `images/{id}/..` e' un percorso che il codice
     * costruisce volentieri. Un nome deve nominare un file, non una cartella.
     */
    public function test_un_nome_fatto_di_soli_punti_viene_rifiutato(): void
    {
        $anna = $this->user('anna');

        foreach (['.', '..', '...'] as $name) {
            $this->actingAs($anna)->postJson('/api/images', [
                'name' => $name,
                'file' => UploadedFile::fake()->image('x.jpg'),
            ])->assertStatus(422);

            $this->actingAs($anna)
                ->getJson('/api/images/'.$name)
                ->assertNotFound();
        }
    }

    /**
     * Cinque megabyte di qualunque cosa entravano nella cartella: `file` e
     * `max` non dicono niente sul contenuto. Il danno era contenuto - la
     * riscarica solo il proprietario - ma un archivio di immagini contiene
     * immagini.
     */
    public function test_un_file_che_non_e_una_immagine_viene_rifiutato(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => 'finta.jpg',
            'file' => UploadedFile::fake()->create('finta.jpg', 10, 'application/pdf'),
        ])->assertStatus(422);
    }

    public function test_una_foto_troppo_grande_viene_rifiutata(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/images', [
            'name' => 'enorme.jpg',
            'file' => UploadedFile::fake()->create('enorme.jpg', 6 * 1024),
        ])->assertStatus(422);
    }

    public function test_una_foto_che_non_esiste_non_esiste(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)
            ->get('/api/images/mai-vista.jpg')
            ->assertNotFound();
    }
}
