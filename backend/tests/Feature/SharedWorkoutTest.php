<?php

namespace Tests\Feature;

use App\Models\SharedWorkout;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * La pubblicazione degli allenamenti: `PUT /api/me/workouts`.
 *
 * Stessa forma di `/me/stats` e stessa promessa: sostituisce, non somma. Il
 * telefono e' la fonte di verita' e il server ne tiene una copia, quindi una
 * riga tolta sul telefono deve sparire anche qui - il contrario vorrebbe dire
 * che gli amici continuano a vedere un allenamento cancellato.
 */
class SharedWorkoutTest extends TestCase
{
    use RefreshDatabase;

    private function user(array $attributes = []): User
    {
        $user = User::create([
            'name' => 'anna',
            'display_name' => 'Anna',
            'email' => 'anna@example.test',
            'password' => 'password123',
            'handle' => 'anna',
            'share_gym' => true,
            ...$attributes,
        ]);

        return $user->refresh();
    }

    private function giorno(string $date, array $exercises): array
    {
        return ['date' => $date, 'exercises' => $exercises];
    }

    private function esercizio(string $name, array $overrides = []): array
    {
        return [
            'name' => $name,
            'sets' => 4,
            'totalReps' => 32,
            'volumeKg' => 2960,
            'topWeightKg' => 92.5,
            ...$overrides,
        ];
    }

    public function test_pubblica_gli_esercizi_di_un_giorno(): void
    {
        $user = $this->user();
        $oggi = now()->toDateString();

        $this->actingAs($user)
            ->putJson('/api/me/workouts', [
                'days' => [
                    $this->giorno($oggi, [
                        $this->esercizio('Panca piana'),
                        $this->esercizio('Squat', ['topWeightKg' => 110]),
                    ]),
                ],
            ])
            ->assertOk()
            ->assertJsonPath('synced', 2);

        $this->assertSame(2, SharedWorkout::where('user_id', $user->id)->count());
    }

    public function test_ripubblicare_sostituisce_il_giorno_invece_di_sommarlo(): void
    {
        $user = $this->user();
        $oggi = now()->toDateString();

        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($oggi, [
                $this->esercizio('Panca piana'),
                $this->esercizio('Squat'),
            ])],
        ])->assertOk();

        // Sul telefono lo squat viene tolto dalla sessione.
        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($oggi, [$this->esercizio('Panca piana')])],
        ])->assertOk();

        $rimasti = SharedWorkout::where('user_id', $user->id)->pluck('exercise_name');
        $this->assertSame(['Panca piana'], $rimasti->all());
    }

    /**
     * Un giorno senza esercizi e' un giorno di riposo, e va detto: e' l'unico
     * modo che il telefono ha per dire "quell'allenamento non c'e' piu'".
     */
    public function test_un_giorno_vuoto_svuota_quel_giorno(): void
    {
        $user = $this->user();
        $oggi = now()->toDateString();

        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($oggi, [$this->esercizio('Panca piana')])],
        ])->assertOk();

        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($oggi, [])],
        ])->assertOk();

        $this->assertSame(0, SharedWorkout::where('user_id', $user->id)->count());
    }

    /**
     * Un giorno che la richiesta non nomina non viene toccato: il telefono
     * pubblica una finestra, non l'intero storico, e "sostituisce" vale per il
     * giorno che ha mandato e non per quelli di cui non ha parlato.
     */
    public function test_un_giorno_non_nominato_resta_dov_era(): void
    {
        $user = $this->user();
        $ieri = now()->subDay()->toDateString();
        $oggi = now()->toDateString();

        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($ieri, [$this->esercizio('Stacco')])],
        ])->assertOk();

        $this->actingAs($user)->putJson('/api/me/workouts', [
            'days' => [$this->giorno($oggi, [$this->esercizio('Panca piana')])],
        ])->assertOk();

        $this->assertSame(2, SharedWorkout::where('user_id', $user->id)->count());
    }

    /**
     * LA SECONDA DIFESA. L'app non manda niente a interruttore spento, ma il
     * server non si fida: e' l'unico dato dell'app che pubblica contenuto, e
     * una difesa sola vuol dire che basta un difetto del telefono perche'
     * esca.
     */
    public function test_a_interruttore_spento_il_server_rifiuta(): void
    {
        $user = $this->user(['share_gym' => false]);

        $this->actingAs($user)
            ->putJson('/api/me/workouts', [
                'days' => [$this->giorno(now()->toDateString(), [
                    $this->esercizio('Panca piana'),
                ])],
            ])
            ->assertStatus(403);

        $this->assertSame(0, SharedWorkout::where('user_id', $user->id)->count());
    }

    /**
     * Stessa ragione: la finestra la sceglie l'utente, e un telefono che ne
     * manda di piu' non deve poterla allargare da solo.
     */
    public function test_i_giorni_fuori_finestra_non_entrano(): void
    {
        $user = $this->user(['share_window_days' => 7]);

        $this->actingAs($user)
            ->putJson('/api/me/workouts', [
                'days' => [
                    $this->giorno(now()->subDays(30)->toDateString(), [
                        $this->esercizio('Stacco'),
                    ]),
                    $this->giorno(now()->toDateString(), [
                        $this->esercizio('Panca piana'),
                    ]),
                ],
            ])
            ->assertOk()
            ->assertJsonPath('synced', 1);

        $rimasti = SharedWorkout::where('user_id', $user->id)->pluck('exercise_name');
        $this->assertSame(['Panca piana'], $rimasti->all());
    }

    public function test_il_nome_dell_esercizio_e_obbligatorio(): void
    {
        $user = $this->user();

        $this->actingAs($user)
            ->putJson('/api/me/workouts', [
                'days' => [$this->giorno(now()->toDateString(), [
                    ['sets' => 4, 'totalReps' => 32, 'volumeKg' => 2960],
                ])],
            ])
            ->assertStatus(422);
    }
}
