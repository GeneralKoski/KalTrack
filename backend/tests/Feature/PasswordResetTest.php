<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Il recupero della password.
 *
 * Le due cose che questi test tengono ferme sono le due che, sbagliate,
 * trasformano un recupero in una via d'ingresso: la risposta uniforme a un
 * indirizzo che non esiste (o l'endpoint diventa un modo per sapere chi e'
 * iscritto) e la caduta dei token dopo il cambio (o chi era dentro resta
 * dentro proprio quando si sospetta che la password sia in mano a qualcuno).
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $handle, bool $admin = false): User
    {
        return User::create([
            'name' => $handle,
            'display_name' => ucfirst($handle),
            'email' => "{$handle}@example.test",
            'password' => 'password123',
            'handle' => $handle,
            'is_admin' => $admin,
        ]);
    }

    public function test_chiedere_il_collegamento_manda_la_notifica(): void
    {
        Notification::fake();
        $anna = $this->user('anna');

        $this->postJson('/api/password/forgot', ['email' => $anna->email])
            ->assertOk();

        Notification::assertSentTo($anna, ResetPassword::class);
    }

    /**
     * Un indirizzo che non esiste riceve la STESSA risposta di uno che esiste.
     *
     * E' la meta' del recupero che non riguarda la comodita': una risposta
     * diversa qui direbbe a chiunque, una email alla volta, chi ha un account
     * su questo server.
     */
    public function test_un_indirizzo_ignoto_risponde_come_uno_noto(): void
    {
        Notification::fake();
        $anna = $this->user('anna');

        $noto = $this->postJson('/api/password/forgot', ['email' => $anna->email]);
        $ignoto = $this->postJson('/api/password/forgot', ['email' => 'nessuno@example.test']);

        $this->assertSame($noto->status(), $ignoto->status());
        $this->assertSame($noto->json('message'), $ignoto->json('message'));
        Notification::assertCount(1);
    }

    public function test_il_token_riscrive_la_password_e_fa_cadere_le_sessioni(): void
    {
        $anna = $this->user('anna');
        $anna->createToken('telefono');
        $this->assertSame(1, $anna->tokens()->count());

        $token = null;
        Notification::fake();
        $this->postJson('/api/password/forgot', ['email' => $anna->email]);
        Notification::assertSentTo($anna, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $this->postJson('/api/password/reset', [
            'token' => $token,
            'email' => $anna->email,
            'password' => 'nuovissima123',
        ])->assertOk();

        $anna->refresh();
        $this->assertTrue(Hash::check('nuovissima123', $anna->password));
        $this->assertSame(0, $anna->tokens()->count());
    }

    public function test_un_token_inventato_non_cambia_niente(): void
    {
        $anna = $this->user('anna');

        $this->postJson('/api/password/reset', [
            'token' => 'inventato',
            'email' => $anna->email,
            'password' => 'nuovissima123',
        ])->assertStatus(422);

        $anna->refresh();
        $this->assertTrue(Hash::check('password123', $anna->password));
    }

    /**
     * Lo stesso collegamento non funziona due volte: il token si consuma.
     *
     * Senza, un collegamento finito in una casella condivisa o in uno storico
     * del browser resterebbe una chiave valida per un'ora a chiunque lo
     * riaprisse.
     */
    public function test_lo_stesso_collegamento_non_si_usa_due_volte(): void
    {
        $anna = $this->user('anna');

        $token = null;
        Notification::fake();
        $this->postJson('/api/password/forgot', ['email' => $anna->email]);
        Notification::assertSentTo($anna, ResetPassword::class, function (ResetPassword $n) use (&$token) {
            $token = $n->token;

            return true;
        });

        $corpo = ['token' => $token, 'email' => $anna->email, 'password' => 'nuovissima123'];

        $this->postJson('/api/password/reset', $corpo)->assertOk();
        $this->postJson('/api/password/reset', [...$corpo, 'password' => 'terzatentativo1'])
            ->assertStatus(422);

        $anna->refresh();
        $this->assertTrue(Hash::check('nuovissima123', $anna->password));
    }

    public function test_la_pagina_del_collegamento_si_apre(): void
    {
        $this->get('/password/reset/un-token?email=anna@example.test')
            ->assertOk()
            ->assertSee('anna@example.test');
    }

    /**
     * Il pannello puo' far partire la mail, e l'indirizzo lo decide la riga
     * dell'utente e non chi chiama: accettarlo dalla richiesta permetterebbe a
     * un amministratore di farsi mandare a casa il collegamento per l'account
     * di un altro.
     */
    public function test_un_amministratore_manda_il_collegamento(): void
    {
        Notification::fake();
        $capo = $this->user('capo', admin: true);
        $anna = $this->user('anna');

        $this->actingAs($capo)
            ->postJson("/api/admin/users/{$anna->id}/password/link", ['email' => 'ladro@example.test'])
            ->assertOk()
            ->assertJson(['email' => $anna->email]);

        Notification::assertSentTo($anna, ResetPassword::class);
    }

    public function test_chi_non_e_amministratore_non_manda_niente(): void
    {
        Notification::fake();
        $anna = $this->user('anna');
        $bruno = $this->user('bruno');

        $this->actingAs($bruno)
            ->postJson("/api/admin/users/{$anna->id}/password/link")
            ->assertForbidden();

        Notification::assertNothingSent();
    }

    public function test_senza_account_non_si_manda_niente(): void
    {
        Notification::fake();
        $anna = $this->user('anna');

        $this->postJson("/api/admin/users/{$anna->id}/password/link")
            ->assertUnauthorized();

        Notification::assertNothingSent();
    }
}
