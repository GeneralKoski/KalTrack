<?php

namespace Tests\Feature;

use App\Enums\FriendshipStatus;
use App\Models\Friendship;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FriendshipTest extends TestCase
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

    public function test_una_richiesta_resta_in_attesa_finche_non_si_accetta(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');

        $this->actingAs($anna)
            ->postJson('/api/friendships', ['handle' => 'bruno'])
            ->assertCreated()
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('direction', 'outgoing');

        // La stessa riga letta dall'altro e' una richiesta IN ENTRATA: senza
        // la direzione la schermata non saprebbe quale bottone offrire.
        $this->actingAs($bruno)->getJson('/api/friendships')
            ->assertOk()
            ->assertJsonPath('data.0.direction', 'incoming')
            ->assertJsonPath('data.0.user.handle', 'anna');

        $this->assertFalse($anna->fresh()->isFriendWith($bruno->fresh()));
    }

    public function test_solo_il_destinatario_puo_accettare(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');
        $friendship = Friendship::create([
            'requester_id' => $anna->id,
            'addressee_id' => $bruno->id,
            'status' => FriendshipStatus::Pending,
        ]);

        // Chi ha chiesto non puo' accettarsi da solo.
        $this->actingAs($anna)
            ->patchJson("/api/friendships/{$friendship->id}/accept")
            ->assertForbidden();

        $this->actingAs($bruno)
            ->patchJson("/api/friendships/{$friendship->id}/accept")
            ->assertOk()
            ->assertJsonPath('status', 'accepted');

        $this->assertTrue($anna->fresh()->isFriendWith($bruno->fresh()));
    }

    /**
     * Il caso che una tabella a due righe avrebbe reso invisibile: se l'altro
     * ha gia' chiesto a noi, il nostro tocco accetta invece di aprire una
     * seconda richiesta che resterebbe pendente per sempre da entrambe le
     * parti.
     */
    public function test_chiedere_a_chi_ha_gia_chiesto_accetta(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');
        Friendship::create([
            'requester_id' => $anna->id,
            'addressee_id' => $bruno->id,
            'status' => FriendshipStatus::Pending,
        ]);

        $this->actingAs($bruno)
            ->postJson('/api/friendships', ['handle' => 'anna'])
            ->assertOk()
            ->assertJsonPath('status', 'accepted');

        $this->assertSame(1, Friendship::count());
        $this->assertTrue($bruno->fresh()->isFriendWith($anna->fresh()));
    }

    public function test_una_seconda_richiesta_non_crea_un_duplicato(): void
    {
        $anna = $this->user('anna');
        $this->user('bruno');

        $this->actingAs($anna)->postJson('/api/friendships', ['handle' => 'bruno']);
        $this->actingAs($anna)->postJson('/api/friendships', ['handle' => 'bruno'])
            ->assertOk();

        $this->assertSame(1, Friendship::count());
    }

    public function test_non_si_puo_aggiungere_se_stessi(): void
    {
        $anna = $this->user('anna');

        $this->actingAs($anna)
            ->postJson('/api/friendships', ['handle' => 'anna'])
            ->assertUnprocessable();
    }

    public function test_rimuovere_cancella_la_riga_e_si_puo_richiedere(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');
        $friendship = Friendship::create([
            'requester_id' => $anna->id,
            'addressee_id' => $bruno->id,
            'status' => FriendshipStatus::Accepted,
            'responded_at' => now(),
        ]);

        $this->actingAs($bruno)
            ->deleteJson("/api/friendships/{$friendship->id}")
            ->assertOk();

        $this->assertSame(0, Friendship::count());
        $this->assertFalse($anna->fresh()->isFriendWith($bruno->fresh()));

        // E si puo' richiedere: un rifiuto non e' un blocco permanente.
        $this->actingAs($anna)
            ->postJson('/api/friendships', ['handle' => 'bruno'])
            ->assertCreated();
    }

    public function test_un_estraneo_non_puo_toccare_l_amicizia_di_altri(): void
    {
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');
        $carla = $this->user('carla');
        $friendship = Friendship::create([
            'requester_id' => $anna->id,
            'addressee_id' => $bruno->id,
            'status' => FriendshipStatus::Pending,
        ]);

        $this->actingAs($carla)
            ->patchJson("/api/friendships/{$friendship->id}/accept")
            ->assertForbidden();
        $this->actingAs($carla)
            ->deleteJson("/api/friendships/{$friendship->id}")
            ->assertForbidden();

        $this->assertSame(1, Friendship::count());
    }
}
