<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Il guscio del gestionale, cioe' le poche righe che la SPA non puo' scrivere
 * da se'.
 *
 * Stanno in `admin.blade.php` e non in un foglio importato da `main.tsx` per
 * un motivo: il pannello non ha nessun CSS proprio - Ant Design inietta il suo
 * a runtime - e una regola che arrivasse col bundle varrebbe solo DOPO che il
 * JavaScript e' partito, cioe' proprio dopo il primo disegno che si vuole
 * evitare di far ballare.
 *
 * Il difetto che queste righe chiudono e' lo sfarfallio in cima a ogni
 * apertura di modulo: si vede solo con le barre di scorrimento sempre visibili
 * (Windows, o macOS con "Mostra sempre"), quindi su una macchina con le barre
 * a sovrapposizione non si riproduce affatto. Il perche' per esteso sta nel
 * commento del template; il gemello lato pannello e' `AdminLayout.test.tsx`.
 */
class AdminShellTest extends TestCase
{
    /**
     * Le tre altezze e il body che non scorre.
     *
     * `#admin-root` e' quello che si dimentica: senza la sua altezza il
     * `Layout` chiede il 100% a un genitore alto zero, e il pannello esce
     * schiacciato.
     */
    public function test_il_guscio_non_scorre_e_da_l_altezza_ai_tre_livelli(): void
    {
        $risposta = $this->get('/admin');

        $risposta->assertOk()
            ->assertSee('html, body, #admin-root { height: 100%; }', false)
            ->assertSee('overflow: hidden', false);
    }

    /** Il punto di innesto della SPA resta quello che `main.tsx` cerca. */
    public function test_la_spa_ha_il_suo_contenitore(): void
    {
        $this->get('/admin')
            ->assertOk()
            ->assertSee('id="admin-root"', false);
    }
}
