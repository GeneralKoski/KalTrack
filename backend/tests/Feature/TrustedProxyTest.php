<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Le intestazioni dell'nginx che sta davanti si credono.
 *
 * Il TLS lo chiude il proxy e al container arriva una richiesta in chiaro con
 * `X-Forwarded-Proto: https`. Senza `trustProxies` quell'intestazione veniva
 * ignorata, e i due difetti che ne seguivano non li vedeva nessun test:
 * `asset()` scriveva `http://` in una pagina `https://` - il browser blocca
 * lo script e il gestionale resta un contenitore vuoto che risponde 200 - e il
 * limite per tentativi su `login` contava il gateway di Docker invece di chi
 * bussa.
 *
 * Un test sul codice di stato non li coglie ne' l'uno ne' l'altro: e' il
 * motivo per cui questo file guarda lo schema e l'IP, che sono le due cose che
 * il proxy racconta.
 */
class TrustedProxyTest extends TestCase
{
    /**
     * Una rotta di comodo, per leggere quel che il framework ha capito della
     * richiesta. Non serve una pagina vera: il gestionale monta Vite, che in
     * un test non ha un manifest da leggere.
     */
    protected function setUp(): void
    {
        parent::setUp();

        Route::get('_prova/richiesta', fn () => response()->json([
            'secure' => request()->isSecure(),
            'ip' => request()->ip(),
            'asset' => asset('build/assets/main.js'),
        ]));
    }

    public function test_una_richiesta_inoltrata_come_https_e_sicura(): void
    {
        $this->get('_prova/richiesta', ['X-Forwarded-Proto' => 'https'])
            ->assertOk()
            ->assertJson(['secure' => true]);
    }

    /**
     * Il difetto vero, quello che si vedeva a schermo: un asset in `http://`
     * dentro una pagina in `https://` viene bloccato dal browser.
     */
    public function test_gli_asset_seguono_lo_schema_inoltrato(): void
    {
        $risposta = $this->get('_prova/richiesta', ['X-Forwarded-Proto' => 'https']);

        $this->assertStringStartsWith('https://', $risposta->json('asset'));
    }

    /**
     * L'altra meta', silenziosa: senza l'IP vero il `throttle` su accesso e
     * registrazione conta tutti insieme, perche' per lui sono lo stesso
     * chiamante.
     */
    public function test_il_client_e_chi_bussa_e_non_il_proxy(): void
    {
        $this->get('_prova/richiesta', ['X-Forwarded-For' => '203.0.113.7'])
            ->assertOk()
            ->assertJson(['ip' => '203.0.113.7']);
    }

    /** Senza intestazioni non si inventa niente: resta quel che e'. */
    public function test_senza_intestazioni_resta_una_richiesta_in_chiaro(): void
    {
        $this->get('_prova/richiesta')
            ->assertOk()
            ->assertJson(['secure' => false]);
    }
}
