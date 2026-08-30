<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use App\Support\Text;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Il catalogo degli esercizi, che e' di tutti gli iscritti.
 *
 * E' L'UNICA COSA DELL'APP CHE ESCE VERSO CHI NON E' AMICO. Tutto il resto -
 * totali, palestra, profilo - passa dalle due regole della privacy; questo no,
 * per scelta: un esercizio proposto da qualcuno entra nell'elenco di chiunque.
 *
 * Per questo i test qui non verificano solo che funzioni, ma che il catalogo
 * non dica **chi** ha aggiunto cosa: sapere che un esercizio l'ha inventato
 * Tizio e' un fatto su Tizio, e non serve a nessuno per allenarsi.
 */
class ExerciseCatalogTest extends TestCase
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

    public function test_aggiunge_un_esercizio_al_catalogo(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->postJson('/api/exercises', [
                'name' => 'Panca piana con bilanciere',
                'muscleGroup' => 'chest',
                'equipment' => 'barbell',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Panca piana con bilanciere');

        $this->assertSame(1, Exercise::count());
    }

    /**
     * La deduplica: senza, il catalogo di tutti si riempie di doppioni al
     * ritmo di uno per persona che scrive lo stesso nome in modo diverso.
     */
    public function test_due_nomi_uguali_a_meno_delle_maiuscole_restano_una_riga(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Panca Piana',
            'muscleGroup' => 'chest',
        ])->assertOk();

        $this->actingAs($bea)->postJson('/api/exercises', [
            'name' => 'panca  piana',
            'muscleGroup' => 'chest',
        ])->assertOk();

        $this->assertSame(1, Exercise::count());
        // Vince il primo nome scritto: le maiuscole si conservano, e' il
        // confronto a ignorarle - la stessa regola dei nomi utente.
        $this->assertSame('Panca Piana', Exercise::first()->name);
    }

    public function test_gli_accenti_non_fanno_un_esercizio_diverso(): void
    {
        $user = $this->user();

        $this->actingAs($user)->postJson('/api/exercises', [
            'name' => 'Curl bicipiti',
            'muscleGroup' => 'arms',
        ])->assertOk();

        $this->actingAs($user)->postJson('/api/exercises', [
            'name' => 'Curl bicìpiti',
            'muscleGroup' => 'arms',
        ])->assertOk();

        $this->assertSame(1, Exercise::count());
    }

    /**
     * L'autore si registra - senza, non esisterebbe "il mio" e una voce
     * scritta male resterebbe nell'app di tutti per sempre - ma NON ESCE.
     * Al suo posto esce `mine`, che dice a chi guarda se puo' correggerla.
     */
    public function test_il_catalogo_non_dice_chi_ha_aggiunto_cosa(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte in alto',
            'muscleGroup' => 'shoulders',
        ])->assertOk();

        $risposta = $this->actingAs($bea)->getJson('/api/exercises')->assertOk();

        $corpo = $risposta->json('data.0');
        $this->assertSame(
            ['id', 'name', 'nameNorm', 'muscleGroup', 'equipment', 'mine'],
            array_keys($corpo),
        );
        // Bea non l'ha aggiunta lei, e da qui non ha modo di sapere chi.
        $this->assertFalse($corpo['mine']);

        $this->assertSame($anna->id, Exercise::first()->created_by);
    }

    public function test_una_voce_e_mia_solo_per_chi_l_ha_aggiunta(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte in alto',
            'muscleGroup' => 'shoulders',
        ])->assertOk();

        $this->actingAs($anna)
            ->getJson('/api/exercises')
            ->assertOk()
            ->assertJsonPath('data.0.mine', true);
    }

    public function test_correggo_una_voce_mia(): void
    {
        $anna = $this->user('anna');
        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte in altoo',
            'muscleGroup' => 'shoulders',
        ])->json('data.id');

        $this->actingAs($anna)
            ->patchJson("/api/exercises/{$id}", [
                'name' => 'Spinte sopra la testa',
                'muscleGroup' => 'shoulders',
                'equipment' => 'manubri',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Spinte sopra la testa');

        $voce = Exercise::find($id);
        // Anche il nome normalizzato si aggiorna, altrimenti la ricerca
        // continuerebbe a trovarla col nome sbagliato e la deduplica userebbe
        // una chiave che non corrisponde piu' al nome.
        $this->assertSame('spinte sopra la testa', $voce->name_norm);
    }

    public function test_cancello_una_voce_mia(): void
    {
        $anna = $this->user('anna');
        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Sbagliato',
            'muscleGroup' => 'chest',
        ])->json('data.id');

        $this->actingAs($anna)
            ->deleteJson("/api/exercises/{$id}")
            ->assertOk();

        $this->assertSame(0, Exercise::count());
    }

    /**
     * La regola che rende il catalogo comune sopportabile: e' di tutti da
     * leggere, di ciascuno da correggere. Senza, chiunque potrebbe riscrivere
     * l'esercizio di chiunque altro nell'app di tutti quanti.
     */
    public function test_non_tocco_la_voce_di_un_altro(): void
    {
        $anna = $this->user('anna');
        $bea = $this->user('bea');

        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte in alto',
            'muscleGroup' => 'shoulders',
        ])->json('data.id');

        $this->actingAs($bea)
            ->patchJson("/api/exercises/{$id}", [
                'name' => 'Roba mia adesso',
                'muscleGroup' => 'chest',
            ])
            ->assertStatus(403);

        $this->actingAs($bea)
            ->deleteJson("/api/exercises/{$id}")
            ->assertStatus(403);

        $this->assertSame('Spinte in alto', Exercise::find($id)->name);
    }

    /**
     * Una voce senza autore - vecchia, o di un account cancellato - resta in
     * elenco e non la modifica piu' nessuno. Sparire dal servizio non deve
     * poter svuotare il catalogo di tutti.
     */
    public function test_una_voce_senza_autore_non_la_tocca_nessuno(): void
    {
        $anna = $this->user('anna');
        $orfana = Exercise::create([
            'name' => 'Voce antica',
            'name_norm' => 'voce antica',
            'muscle_group' => 'chest',
        ]);

        $this->actingAs($anna)
            ->deleteJson("/api/exercises/{$orfana->id}")
            ->assertStatus(403);

        $this->assertSame(1, Exercise::count());
    }

    public function test_rinominando_non_si_finisce_addosso_a_un_altra_voce(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Panca piana',
            'muscleGroup' => 'chest',
        ])->assertOk();

        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Squat',
            'muscleGroup' => 'legs',
        ])->json('data.id');

        $this->actingAs($anna)
            ->patchJson("/api/exercises/{$id}", [
                'name' => 'panca  piana',
                'muscleGroup' => 'legs',
            ])
            ->assertStatus(422);
    }

    public function test_il_catalogo_si_cerca_per_nome(): void
    {
        $user = $this->user();

        foreach (['Panca piana', 'Squat', 'Panca inclinata'] as $nome) {
            $this->actingAs($user)->postJson('/api/exercises', [
                'name' => $nome,
                'muscleGroup' => 'chest',
            ])->assertOk();
        }

        $this->actingAs($user)
            ->getJson('/api/exercises?q=panca')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_senza_accesso_il_catalogo_non_si_vede(): void
    {
        // Di tutti gli iscritti, non del mondo: il catalogo e' aperto a chi ha
        // un account, e non c'e' nessuna lettura pubblica in questa API.
        $this->getJson('/api/exercises')->assertStatus(401);
        $this->postJson('/api/exercises', ['name' => 'Squat'])->assertStatus(401);
    }

    public function test_un_nome_vuoto_non_entra_in_catalogo(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->postJson('/api/exercises', ['name' => '   ', 'muscleGroup' => 'chest'])
            ->assertStatus(422);
    }

    /**
     * Gli stessi casi di `src/domain/text.test.ts`. Se una delle due
     * implementazioni cambia senza l'altra, "Caffe" e "Caffè" diventano due
     * esercizi diversi da una parte e uno solo dall'altra.
     */
    public function test_la_normalizzazione_e_la_stessa_del_telefono(): void
    {
        $this->assertSame('petto di pollo', Text::normalize('Petto di Pollo'));
        $this->assertSame('caffe', Text::normalize('Caffè'));
        $this->assertSame('pure', Text::normalize('Purè'));
        $this->assertSame('ragu', Text::normalize('Ragù'));
        $this->assertSame('yogurt greco', Text::normalize('  yogurt   greco  '));
    }
}
