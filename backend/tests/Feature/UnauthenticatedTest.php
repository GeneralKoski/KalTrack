<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Una richiesta senza token deve sempre ricevere 401.
 *
 * Anche quando il client non chiede JSON: senza questo Laravel prova a
 * mandarlo alla pagina di login, che in un'API pura non esiste, e la risposta
 * diventa un 500 che nasconde la vera ragione del rifiuto.
 */
class UnauthenticatedTest extends TestCase
{
    use RefreshDatabase;

    public function test_senza_token_risponde_401_anche_senza_accept_json(): void
    {
        $this->get('/api/friendships')->assertUnauthorized();
        $this->get('/api/me')->assertUnauthorized();
        $this->get('/api/users/qualcuno')->assertUnauthorized();
    }

    public function test_senza_token_risponde_401_con_accept_json(): void
    {
        $this->getJson('/api/friendships')->assertUnauthorized();
    }
}
