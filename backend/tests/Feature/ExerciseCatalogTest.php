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

        // Pubblicata direttamente sul model: il catalogo che si legge da
        // `GET` mostra solo voci gia' approvate, e questo test riguarda
        // proprio la lettura del catalogo, non la proposta.
        Exercise::create([
            'name' => 'Spinte in alto',
            'name_norm' => 'spinte in alto',
            'muscle_group' => 'shoulders',
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

        $risposta = $this->actingAs($bea)->getJson('/api/exercises')->assertOk();

        $corpo = $risposta->json('data.0');
        $this->assertSame(
            [
                'id',
                'name',
                'nameNorm',
                'muscleGroup',
                'secondaryMuscles',
                'equipment',
                'mine',
            ],
            array_keys($corpo),
        );
        // Bea non l'ha aggiunta lei, e da qui non ha modo di sapere chi.
        $this->assertFalse($corpo['mine']);

        $this->assertSame($anna->id, Exercise::first()->created_by);
    }

    public function test_una_voce_e_mia_solo_per_chi_l_ha_aggiunta(): void
    {
        $anna = $this->user('anna');

        // Pubblicata direttamente: `mine` si legge dal catalogo, che mostra
        // solo voci gia' approvate.
        Exercise::create([
            'name' => 'Spinte in alto',
            'name_norm' => 'spinte in alto',
            'muscle_group' => 'shoulders',
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

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
     * La cancellazione e' morbida: sparisce dall'elenco ma resta in tabella
     * con `deleted_at` valorizzato, perche' una voce tolta deve poter dire a
     * un pannello di amministrazione che non c'e' piu'.
     */
    public function test_cancello_una_voce_e_resta_come_cancellata(): void
    {
        $anna = $this->user('anna');
        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Sbagliato',
            'muscleGroup' => 'chest',
        ])->json('data.id');

        $this->actingAs($anna)
            ->deleteJson("/api/exercises/{$id}")
            ->assertOk();

        $this->assertNull(Exercise::find($id));
        $this->assertNotNull(Exercise::withTrashed()->find($id)->deleted_at);
    }

    /**
     * Chi ha tolto una voce dal catalogo lo ha fatto apposta: una proposta
     * con lo stesso nome non deve resuscitarla, la stessa regola per cui
     * `applyExerciseSeeds` sul telefono non resuscita mai un esercizio
     * cancellato.
     */
    public function test_proporre_il_nome_di_una_voce_cancellata_non_la_resuscita(): void
    {
        $anna = $this->user('anna');
        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Panca piana',
            'muscleGroup' => 'chest',
        ])->json('data.id');

        $this->actingAs($anna)->deleteJson("/api/exercises/{$id}")->assertOk();

        $bea = $this->user('bea');
        $this->actingAs($bea)
            ->postJson('/api/exercises', [
                'name' => 'Panca piana',
                'muscleGroup' => 'chest',
            ])
            ->assertOk();

        // Nessuna riga in piu' e nessuna resuscitata.
        $this->assertSame(0, Exercise::count());
        $this->assertSame(1, Exercise::withTrashed()->count());
        $this->assertNotNull(Exercise::withTrashed()->find($id)->deleted_at);
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

    /**
     * L'indice unico su `name_norm` copre anche le righe cancellate: senza
     * `withTrashed()` sul controllo, questa rinomina avrebbe superato il
     * controllo e sarebbe finita sull'eccezione non gestita del database
     * invece che su un 422 leggibile.
     */
    public function test_non_ci_si_rinomina_sul_nome_di_una_voce_cancellata(): void
    {
        $anna = $this->user('anna');

        $cancellataId = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Panca piana',
            'muscleGroup' => 'chest',
        ])->json('data.id');
        $this->actingAs($anna)->deleteJson("/api/exercises/{$cancellataId}")->assertOk();

        $id = $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Squat',
            'muscleGroup' => 'legs',
        ])->json('data.id');

        $this->actingAs($anna)
            ->patchJson("/api/exercises/{$id}", [
                'name' => 'Panca piana',
                'muscleGroup' => 'legs',
            ])
            ->assertStatus(422)
            ->assertJsonPath('errors.name.0', 'Nome gia\' in catalogo.');
    }

    public function test_il_catalogo_si_cerca_per_nome(): void
    {
        $user = $this->user();

        // Pubblicate direttamente: la ricerca e' sul catalogo, cioe' sulle
        // voci gia' approvate, non sulle proposte appena fatte.
        foreach (['Panca piana', 'Squat', 'Panca inclinata'] as $nome) {
            Exercise::create([
                'name' => $nome,
                'name_norm' => Text::normalize($nome),
                'muscle_group' => 'chest',
                'status' => 'published',
                'created_by' => $user->id,
            ]);
        }

        $this->actingAs($user)
            ->getJson('/api/exercises?q=panca')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    /**
     * I muscoli secondari viaggiano: senza, gli esercizi importati arrivavano
     * con la lista vuota e `suggestAlternatives` - che propone il sostituto
     * quando un attrezzo e' occupato - lavorava peggio proprio su quelli.
     */
    public function test_il_catalogo_porta_anche_i_muscoli_secondari(): void
    {
        $anna = $this->user();

        $this->actingAs($anna)
            ->postJson('/api/exercises', [
                'name' => 'Panca piana',
                'muscleGroup' => 'petto',
                'secondaryMuscles' => 'tricipiti,spalle',
                'equipment' => 'bilanciere,panca',
            ])
            ->assertOk()
            ->assertJsonPath('data.secondaryMuscles', 'tricipiti,spalle');

        // Il catalogo legge solo le voci pubblicate: la si pubblica a mano
        // per verificare che il campo sopravviva anche in lettura.
        Exercise::first()->update(['status' => 'published']);

        $this->actingAs($anna)
            ->getJson('/api/exercises')
            ->assertOk()
            ->assertJsonPath('data.0.secondaryMuscles', 'tricipiti,spalle');
    }

    /**
     * Il catalogo cresce con gli iscritti: senza cursore, oltre la prima
     * pagina le voci non erano raggiungibili in nessun modo.
     */
    public function test_oltre_una_pagina_si_continua_col_cursore(): void
    {
        $anna = $this->user();

        // Duecentouno voci: una in piu' della pagina.
        $righe = [];
        for ($i = 1; $i <= 201; $i++) {
            $nome = 'Esercizio '.str_pad((string) $i, 3, '0', STR_PAD_LEFT);
            $righe[] = [
                'name' => $nome,
                'name_norm' => Text::normalize($nome),
                'muscle_group' => 'petto',
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        Exercise::insert($righe);

        $prima = $this->actingAs($anna)->getJson('/api/exercises')->assertOk();
        $prima->assertJsonCount(200, 'data');
        $cursore = $prima->json('next');
        $this->assertNotNull($cursore);

        $seconda = $this->actingAs($anna)
            ->getJson('/api/exercises?after='.urlencode($cursore))
            ->assertOk();

        $seconda->assertJsonCount(1, 'data');
        // Finita: chi importa sa che non c'e' altro da chiedere.
        $this->assertNull($seconda->json('next'));
        // E la voce non e' una di quelle gia' ricevute.
        $this->assertSame('Esercizio 201', $seconda->json('data.0.name'));
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

    public function test_una_proposta_non_esce_dal_catalogo(): void
    {
        $anna = User::factory()->create();

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        // Nemmeno al suo autore: la voce e' gia' sul suo telefono, e
        // rimandargliela nel catalogo comune direbbe che e' stata pubblicata.
        $this->actingAs($anna)->getJson('/api/exercises')
            ->assertOk()
            ->assertJsonMissing(['name' => 'Spinte con la sedia']);
    }

    public function test_una_proposta_nasce_in_attesa(): void
    {
        $anna = User::factory()->create();

        $this->actingAs($anna)->postJson('/api/exercises', [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        $voce = Exercise::where('name_norm', 'spinte con la sedia')->first();
        $this->assertSame('pending', $voce->status);
        $this->assertSame($anna->id, $voce->created_by);
    }

    public function test_una_voce_pubblicata_non_si_corregge_piu_dall_app(): void
    {
        $anna = User::factory()->create();

        $voce = Exercise::create([
            'uid' => 'x-1',
            'name' => 'Spinte',
            'name_norm' => 'spinte',
            'muscle_group' => 'petto',
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

        // Da pubblicata in poi la voce e' di tutti: correggerla la
        // cambierebbe nell'app di chiunque, e quella decisione sta al
        // gestionale. L'autore ha comunque la sua copia sul telefono.
        $this->actingAs($anna)->patchJson("/api/exercises/{$voce->id}", [
            'name' => 'Spinte modificate',
            'muscleGroup' => 'petto',
        ])->assertForbidden();
    }

    public function test_una_voce_pubblicata_non_si_cancella_piu_dall_app(): void
    {
        $anna = User::factory()->create();

        $voce = Exercise::create([
            'uid' => 'x-3',
            'name' => 'Spinte',
            'name_norm' => 'spinte',
            'muscle_group' => 'petto',
            'status' => 'published',
            'created_by' => $anna->id,
        ]);

        // Stessa ragione della correzione: da pubblicata in poi la voce e' di
        // tutti, e toglierla dal catalogo comune e' una decisione che sta al
        // gestionale.
        $this->actingAs($anna)
            ->deleteJson("/api/exercises/{$voce->id}")
            ->assertForbidden();

        $this->assertNotNull($voce->fresh());
    }

    public function test_una_proposta_propria_si_corregge_ancora(): void
    {
        $anna = User::factory()->create();

        $voce = Exercise::create([
            'uid' => 'x-2',
            'name' => 'Spinte',
            'name_norm' => 'spinte',
            'muscle_group' => 'petto',
            'status' => 'pending',
            'created_by' => $anna->id,
        ]);

        $this->actingAs($anna)->patchJson("/api/exercises/{$voce->id}", [
            'name' => 'Spinte con la sedia',
            'muscleGroup' => 'petto',
        ])->assertOk();

        $this->assertSame('Spinte con la sedia', $voce->fresh()->name);
    }
}
