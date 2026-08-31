<?php

namespace Tests\Feature;

use App\Enums\FriendshipStatus;
use App\Models\Friendship;
use App\Models\SharedStat;
use App\Models\SharedWorkout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Il confronto con piu' persone insieme: `GET /api/comparison`.
 *
 * Un endpoint solo per N persone e non N chiamate: le due regole della privacy
 * pero' restano per ciascuno, e un non amico in mezzo all'elenco non deve far
 * fallire la richiesta degli altri.
 */
class ComparisonTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle, array $attributes = []): User
    {
        $user = User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
            ...$attributes,
        ]);

        return $user->refresh();
    }

    private function befriend(User $a, User $b): void
    {
        Friendship::create([
            'requester_id' => $a->id,
            'addressee_id' => $b->id,
            'status' => FriendshipStatus::Accepted,
            'responded_at' => now(),
        ]);
    }

    private function withStats(User $user, array $overrides = []): void
    {
        SharedStat::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'kcal' => 2100,
            'steps' => 9450,
            'weight_kg' => 78.5,
            'workouts' => 1,
            ...$overrides,
        ]);
    }

    private function withWorkout(User $user, string $name = 'Panca piana'): void
    {
        SharedWorkout::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'exercise_name' => $name,
            'sets' => 4,
            'total_reps' => 32,
            'volume_kg' => 2960,
            'top_weight_kg' => 92.5,
        ]);
    }

    public function test_torna_i_numeri_degli_amici_in_una_chiamata_sola(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_steps' => true]);
        $bea = $this->user('bea', ['share_calories' => true]);

        $this->befriend($me, $anna);
        $this->befriend($bea, $me);
        $this->withStats($anna);
        $this->withStats($bea);

        $risposta = $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna,bea')
            ->assertOk();

        $risposta->assertJsonCount(2, 'participants');
        $risposta->assertJsonPath('participants.0.handle', 'anna');
        $risposta->assertJsonPath('participants.0.totals.steps', 9450);
        // Anna non condivide le calorie: il numero c'e' sul server ma non esce.
        $risposta->assertJsonPath('participants.0.totals.kcal', null);
        $risposta->assertJsonPath('participants.1.totals.kcal', 2100);
        $risposta->assertJsonPath('participants.1.totals.steps', null);
    }

    /**
     * La regola che rende l'endpoint utilizzabile: un non amico esce senza
     * numeri e non fa fallire la richiesta. Il contrario vorrebbe dire che
     * basta togliere l'amicizia perche' il confronto smetta di funzionare per
     * tutti gli altri.
     */
    public function test_un_non_amico_esce_senza_numeri_e_non_rompe_gli_altri(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_steps' => true]);
        $estranea = $this->user('estranea', ['share_steps' => true]);

        $this->befriend($me, $anna);
        $this->withStats($anna);
        $this->withStats($estranea);

        $risposta = $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna,estranea')
            ->assertOk();

        $risposta->assertJsonPath('participants.0.totals.steps', 9450);
        $risposta->assertJsonPath('participants.1.isFriend', false);
        $risposta->assertJsonPath('participants.1.totals.steps', null);
        $risposta->assertJsonPath('participants.1.shares.steps', false);
        $risposta->assertJsonPath('participants.1.exercises', []);
    }

    public function test_la_palestra_esce_solo_a_interruttore_acceso(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_gym' => true]);
        $bea = $this->user('bea');

        $this->befriend($me, $anna);
        $this->befriend($me, $bea);
        $this->withWorkout($anna);
        // Bea ha righe pubblicate da prima e l'interruttore ora spento: il
        // filtro in lettura e' la seconda difesa dopo la cancellazione.
        $this->withWorkout($bea);

        $risposta = $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna,bea')
            ->assertOk();

        $risposta->assertJsonCount(1, 'participants.0.exercises');
        $risposta->assertJsonPath('participants.0.exercises.0.name', 'Panca piana');
        $risposta->assertJsonPath('participants.0.exercises.0.topWeightKg', 92.5);
        $risposta->assertJsonCount(0, 'participants.1.exercises');
    }

    public function test_la_palestra_non_esce_a_un_non_amico(): void
    {
        $me = $this->user('io');
        $estranea = $this->user('estranea', ['share_gym' => true]);
        $this->withWorkout($estranea);

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=estranea')
            ->assertOk()
            ->assertJsonCount(0, 'participants.0.exercises');
    }

    /** Quattro piu' se stessi: il limite e' della schermata, ma va imposto qui. */
    public function test_oltre_quattro_handle_la_richiesta_e_rifiutata(): void
    {
        $me = $this->user('io');
        foreach (['a1', 'b1', 'c1', 'd1', 'e1'] as $handle) {
            $this->user($handle);
        }

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=a1,b1,c1,d1,e1')
            ->assertStatus(422);
    }

    public function test_un_handle_sconosciuto_viene_ignorato(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_steps' => true]);
        $this->befriend($me, $anna);
        $this->withStats($anna);

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna,nessuno')
            ->assertOk()
            ->assertJsonCount(1, 'participants');
    }

    /** Le maiuscole non contano, qui come ovunque si cerchi un nome utente. */
    public function test_gli_handle_si_cercano_senza_guardare_le_maiuscole(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_steps' => true]);
        $this->befriend($me, $anna);
        $this->withStats($anna);

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=ANNA')
            ->assertOk()
            ->assertJsonPath('participants.0.totals.steps', 9450);
    }

    public function test_se_stessi_non_si_confronta_con_se_stessi(): void
    {
        $me = $this->user('io', ['share_steps' => true]);
        $this->withStats($me);

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=io')
            ->assertOk()
            ->assertJsonCount(0, 'participants');
    }

    /**
     * Il confronto su un periodo.
     *
     * Passi e allenamenti si SOMMANO - "quanti ne hai fatti in una settimana" -
     * mentre le calorie si fanno in MEDIA: la somma settimanale delle calorie
     * di due persone che hanno registrato giorni diversi confronterebbe chi ha
     * scritto di piu', non chi ha mangiato di piu'.
     */
    public function test_su_piu_giorni_somma_l_attivita_e_fa_la_media_delle_calorie(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', [
            'share_steps' => true,
            'share_calories' => true,
            'share_workouts' => true,
        ]);
        $this->befriend($me, $anna);

        $this->withStats($anna, ['kcal' => 2000, 'steps' => 10000, 'workouts' => 1]);
        SharedStat::create([
            'user_id' => $anna->id,
            'date' => now()->subDays(2)->toDateString(),
            'kcal' => 3000,
            'steps' => 4000,
            'workouts' => 2,
        ]);

        $risposta = $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna&days=7')
            ->assertOk();

        $risposta->assertJsonPath('days', 7);
        $risposta->assertJsonPath('participants.0.totals.steps', 14000);
        $risposta->assertJsonPath('participants.0.totals.workouts', 3);
        // La media sui giorni REGISTRATI, non su sette: chi ha scritto due
        // giorni su sette non mangia in media 714 kcal.
        $risposta->assertJsonPath('participants.0.totals.kcal', 2500);
    }

    public function test_su_piu_giorni_la_palestra_si_somma_per_esercizio(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', ['share_gym' => true]);
        $this->befriend($me, $anna);

        $this->withWorkout($anna);
        SharedWorkout::create([
            'user_id' => $anna->id,
            'date' => now()->subDays(3)->toDateString(),
            'exercise_name' => 'Panca piana',
            'sets' => 3,
            'total_reps' => 20,
            'volume_kg' => 1600,
            'top_weight_kg' => 100,
        ]);

        $risposta = $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna&days=7')
            ->assertOk();

        $risposta->assertJsonCount(1, 'participants.0.exercises');
        $risposta->assertJsonPath('participants.0.exercises.0.sets', 7);
        $risposta->assertJsonPath('participants.0.exercises.0.volumeKg', 4560);
        // Il carico massimo e' il massimo del periodo, non la somma: sommare i
        // massimali direbbe che ha alzato 192,5 kg.
        $risposta->assertJsonPath('participants.0.exercises.0.topWeightKg', 100);
    }

    /**
     * Il periodo lo sceglie chi guarda, e arriva fin dove arriva lo storico:
     * la finestra per persona non esiste piu'.
     */
    public function test_il_periodo_lungo_pesca_tutto_lo_storico(): void
    {
        $me = $this->user('io');
        $anna = $this->user('anna', [
            'share_steps' => true,
        ]);
        $this->befriend($me, $anna);

        $this->withStats($anna, ['steps' => 10000]);
        SharedStat::create([
            'user_id' => $anna->id,
            'date' => now()->subDays(10)->toDateString(),
            'steps' => 99000,
        ]);

        $this->actingAs($me)
            ->getJson('/api/comparison?handles=anna&days=365')
            ->assertOk()
            ->assertJsonPath('participants.0.totals.steps', 109000);
    }

    public function test_senza_accesso_non_si_confronta_niente(): void
    {
        $this->getJson('/api/comparison?handles=anna')->assertStatus(401);
    }
}
