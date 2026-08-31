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
 * L'interruttore che pubblica la palestra.
 *
 * E' l'unico punto del progetto in cui esce CONTENUTO e non un totale: quali
 * esercizi si fanno e con quanto carico. Per questo ha un test suo e non una
 * riga in fondo a PrivacyTest: quel che viene verificato qui non e' che il
 * filtro funzioni, ma che l'interruttore parta spento, che sia indipendente da
 * quello del conteggio, e che spegnendolo i dati spariscano davvero.
 */
class GymSharingTest extends TestCase
{
    use RefreshDatabase;

    /**
     * `refresh()` e non solo `create()`: i default stanno nel database, e un
     * modello appena creato non li ha ancora in memoria. Senza, `actingAs()`
     * autenticherebbe un utente con le condivisioni a null - una situazione
     * che in produzione non esiste, perche' l'utente arriva sempre riletto dal
     * token, e che qui darebbe risultati inventati.
     */
    private function user(array $attributes = []): User
    {
        $user = User::create([
            'name' => 'anna',
            'display_name' => 'Anna',
            'email' => 'anna@example.test',
            'password' => 'password123',
            'handle' => 'anna',
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

    private function withWorkout(User $user): void
    {
        SharedWorkout::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'exercise_name' => 'Panca piana',
            'sets' => 4,
            'total_reps' => 32,
            'volume_kg' => 2960,
            'top_weight_kg' => 92.5,
        ]);
    }

    public function test_un_account_nuovo_non_condivide_la_palestra(): void
    {
        $user = $this->user();

        $this->assertFalse($user->share_gym);
    }

    /**
     * I due interruttori sono promesse diverse: "mi sono allenato tre volte" e
     * "ho fatto panca a 92,5". Chi aveva acceso il primo non deve ritrovarsi
     * acceso il secondo per via di un aggiornamento.
     */
    public function test_condividere_il_conteggio_non_accende_la_palestra(): void
    {
        $user = $this->user(['share_workouts' => true]);

        $this->assertTrue($user->share_workouts);
        $this->assertFalse($user->share_gym);
    }

    public function test_accendere_e_spegnere_la_palestra_dal_profilo(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->patchJson('/api/me', ['shareGym' => true])
            ->assertOk()
            ->assertJsonPath('shares.gym', true);

        $this->assertTrue($user->fresh()->share_gym);
    }

    public function test_spegnere_la_palestra_cancella_quel_che_era_uscito(): void
    {
        $user = $this->user(['share_gym' => true]);
        $this->withWorkout($user);

        $this->assertSame(1, SharedWorkout::where('user_id', $user->id)->count());

        $this->actingAs($user)
            ->patchJson('/api/me', ['shareGym' => false])
            ->assertOk();

        $this->assertSame(0, SharedWorkout::where('user_id', $user->id)->count());
    }

    /**
     * Spegnere un'altra condivisione non deve toccare la palestra: le colonne
     * di shared_stats e le righe di shared_workouts sono cose separate, e un
     * `delete()` scritto male le confonderebbe senza che nessun test se ne
     * accorga.
     */
    public function test_spegnere_le_calorie_non_tocca_la_palestra(): void
    {
        $user = $this->user(['share_gym' => true, 'share_calories' => true]);
        $this->withWorkout($user);

        $this->actingAs($user)
            ->patchJson('/api/me', ['shareCalories' => false])
            ->assertOk();

        $this->assertSame(1, SharedWorkout::where('user_id', $user->id)->count());
    }

    /**
     * Il profilo di un amico deve poter mostrare la palestra: senza il campo
     * qui, l'unico posto dove si vede sarebbe la schermata del confronto, e
     * aprire il profilo di qualcuno direbbe meno di quel che lui condivide.
     */
    public function test_il_profilo_di_un_amico_porta_la_palestra(): void
    {
        $anna = $this->user(['share_gym' => true]);
        $this->withWorkout($anna);

        $io = User::create([
            'name' => 'io',
            'email' => 'io@example.test',
            'password' => 'password123',
            'handle' => 'io',
        ])->refresh();
        $this->befriend($io, $anna);

        $this->actingAs($io)
            ->getJson('/api/users/anna')
            ->assertOk()
            ->assertJsonPath('data.shares.gym', true)
            ->assertJsonPath('data.gym.0.exercises.0.name', 'Panca piana')
            ->assertJsonPath('data.gym.0.exercises.0.topWeightKg', 92.5);
    }

    public function test_a_uno_sconosciuto_il_profilo_non_dice_niente_della_palestra(): void
    {
        $anna = $this->user(['share_gym' => true]);
        $this->withWorkout($anna);

        $estraneo = User::create([
            'name' => 'estraneo',
            'email' => 'estraneo@example.test',
            'password' => 'password123',
            'handle' => 'estraneo',
        ])->refresh();

        $this->actingAs($estraneo)
            ->getJson('/api/users/anna')
            ->assertOk()
            // Nemmeno il fatto che la condivida: "condivide la palestra ma tu
            // non la vedi" e' un'informazione su di lei data a un estraneo.
            ->assertJsonPath('data.shares.gym', false)
            ->assertJsonPath('data.gym', []);
    }

    /**
     * Il profilo serve TUTTO lo storico pubblicato.
     *
     * Prima si fermava alla finestra scelta dal proprietario, sette giorni di
     * serie: due persone che si allenano da mesi vedevano sempre e solo
     * l'ultima settimana. Cosa esce lo dicono i cinque interruttori, non un
     * numero di giorni.
     */
    public function test_il_profilo_mostra_tutto_lo_storico(): void
    {
        $anna = $this->user(['share_calories' => true]);

        SharedStat::create([
            'user_id' => $anna->id,
            'date' => now()->subDays(20)->toDateString(),
            'kcal' => 1900,
        ]);
        SharedStat::create([
            'user_id' => $anna->id,
            'date' => now()->toDateString(),
            'kcal' => 2100,
        ]);

        $io = User::create([
            'name' => 'io',
            'email' => 'io@example.test',
            'password' => 'password123',
            'handle' => 'io',
        ])->refresh();
        $this->befriend($io, $anna);

        $this->actingAs($io)
            ->getJson('/api/users/anna')
            ->assertOk()
            ->assertJsonCount(2, 'data.stats');
    }

    /**
     * La finestra non esiste piu': il campo non viene rifiutato, viene
     * ignorato, e il profilo non ne parla piu'.
     */
    public function test_la_finestra_non_si_sceglie_piu(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->patchJson('/api/me', ['shareWindowDays' => 90])
            ->assertOk()
            ->assertJsonMissingPath('shares.windowDays');
    }

    /**
     * Quel che era gia' uscito resta fuori: spegnere un interruttore ritira i
     * dati, ma qui nessun interruttore si e' spento. Toglierli sarebbe
     * cancellare storico senza che nessuno l'abbia chiesto.
     */
    public function test_salvare_il_profilo_non_cancella_i_giorni_vecchi(): void
    {
        $user = $this->user(['share_gym' => true]);

        SharedWorkout::create([
            'user_id' => $user->id,
            'date' => now()->subDays(60)->toDateString(),
            'exercise_name' => 'Squat',
            'sets' => 5,
            'total_reps' => 25,
            'volume_kg' => 2500,
            'top_weight_kg' => 110,
        ]);
        $this->withWorkout($user);

        $this->actingAs($user)
            ->patchJson('/api/me', ['shareCalories' => true])
            ->assertOk();

        $this->assertCount(2, SharedWorkout::where('user_id', $user->id)->get());
    }
}
