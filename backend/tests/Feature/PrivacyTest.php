<?php

namespace Tests\Feature;

use App\Enums\FriendshipStatus;
use App\Models\Friendship;
use App\Models\SharedStat;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * La privacy del profilo pubblico.
 *
 * Questi test valgono piu' di ogni altro qui dentro: sono l'unica cosa che
 * impedisce a un campo aggiunto domani di uscire per tutti. Ogni numero deve
 * passare due controlli, e ognuno dei due ha il suo test.
 */
class PrivacyTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle, array $shares = []): User
    {
        return User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
            ...$shares,
        ]);
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

    private function withStats(User $user): void
    {
        SharedStat::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'kcal' => 2100,
            'steps' => 9450,
            'weight_kg' => 78.5,
            'workouts' => 1,
        ]);
    }

    public function test_uno_sconosciuto_non_vede_nessun_numero(): void
    {
        $owner = $this->user('anna', [
            'share_calories' => true,
            'share_steps' => true,
            'share_weight' => true,
            'share_workouts' => true,
        ]);
        $this->withStats($owner);
        $stranger = $this->user('bruno');

        $response = $this->actingAs($stranger)->getJson('/api/users/anna');

        $response->assertOk();
        // Il nome si vede: senza, la ricerca amici non servirebbe a niente.
        $response->assertJsonPath('data.displayName', 'Anna');
        $response->assertJsonPath('data.isFriend', false);
        // Lo storico non esce nemmeno vuoto di contenuto: non esce.
        $this->assertSame([], $response->json('data.stats'));
    }

    public function test_un_amico_vede_solo_cio_che_e_condiviso(): void
    {
        $owner = $this->user('anna', [
            'share_steps' => true,
            // calorie, peso e allenamenti restano spenti.
        ]);
        $this->withStats($owner);
        $friend = $this->user('bruno');
        $this->befriend($owner, $friend);

        $response = $this->actingAs($friend)->getJson('/api/users/anna');

        $response->assertOk();
        $response->assertJsonPath('data.isFriend', true);
        $response->assertJsonPath('data.stats.0.steps', 9450);
        // Null e non zero: "non condiviso" non e' "ha camminato zero".
        $response->assertJsonPath('data.stats.0.kcal', null);
        $response->assertJsonPath('data.stats.0.weightKg', null);
        $response->assertJsonPath('data.stats.0.workouts', null);
    }

    public function test_un_profilo_nuovo_non_condivide_niente(): void
    {
        $owner = $this->user('anna');
        $this->withStats($owner);
        $friend = $this->user('bruno');
        $this->befriend($owner, $friend);

        $response = $this->actingAs($friend)->getJson('/api/users/anna');

        $response->assertJsonPath('data.stats.0.kcal', null);
        $response->assertJsonPath('data.stats.0.steps', null);
        $response->assertJsonPath('data.stats.0.weightKg', null);
        $response->assertJsonPath('data.stats.0.workouts', null);
    }

    public function test_una_richiesta_in_attesa_non_e_amicizia(): void
    {
        $owner = $this->user('anna', ['share_steps' => true]);
        $this->withStats($owner);
        $other = $this->user('bruno');
        Friendship::create([
            'requester_id' => $other->id,
            'addressee_id' => $owner->id,
            'status' => FriendshipStatus::Pending,
        ]);

        $response = $this->actingAs($other)->getJson('/api/users/anna');

        $response->assertJsonPath('data.isFriend', false);
        $this->assertSame([], $response->json('data.stats'));
    }

    public function test_senza_account_non_si_vede_niente(): void
    {
        $this->user('anna', ['share_steps' => true]);

        $this->getJson('/api/users/anna')->assertUnauthorized();
        $this->getJson('/api/users?q=ann')->assertUnauthorized();
        $this->getJson('/api/friendships')->assertUnauthorized();
    }

    public function test_la_ricerca_non_elenca_tutti(): void
    {
        $this->user('anna');
        $this->user('bruno');
        $me = $this->user('carla');

        // Senza query non torna nessuno: un elenco degli iscritti non e' una
        // funzione della ricerca amici.
        $this->actingAs($me)->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($me)->getJson('/api/users?q=a')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($me)->getJson('/api/users?q=ann')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.handle', 'anna');
    }

    public function test_la_ricerca_non_restituisce_se_stessi(): void
    {
        $me = $this->user('anna');

        $this->actingAs($me)->getJson('/api/users?q=anna')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
    /**
     * "Nessuno li vede" e "non ci sono" non sono la stessa cosa, e chi spegne
     * una condivisione ha chiesto la seconda. Prima il server si teneva mesi
     * di dati di qualcuno che aveva appena detto di non volerli piu'
     * condividere: l'app, con tutto spento, non manda piu' niente, quindi non
     * aveva nemmeno l'occasione di dire al server di dimenticare.
     */
    public function test_spegnere_una_condivisione_cancella_quel_che_era_pubblicato(): void
    {
        $anna = $this->user('anna', [
            'share_calories' => true,
            'share_steps' => true,
        ]);
        $this->withStats($anna);

        $this->actingAs($anna)
            ->patchJson('/api/me', ['shareSteps' => false])
            ->assertOk();

        $riga = SharedStat::where('user_id', $anna->id)->firstOrFail();
        $this->assertNull($riga->steps, 'i passi dovevano sparire');
        $this->assertSame(2100, (int) $riga->kcal, 'le calorie erano ancora condivise');
    }

    public function test_spegnere_tutto_non_lascia_niente_sul_server(): void
    {
        $anna = $this->user('anna', [
            'share_calories' => true,
            'share_steps' => true,
            'share_weight' => true,
            'share_workouts' => true,
        ]);
        $this->withStats($anna);

        $this->actingAs($anna)->patchJson('/api/me', [
            'shareCalories' => false,
            'shareSteps' => false,
            'shareWeight' => false,
            'shareWorkouts' => false,
        ])->assertOk();

        // Non una riga di quattro null: proprio niente.
        $this->assertSame(0, SharedStat::where('user_id', $anna->id)->count());
    }

}
