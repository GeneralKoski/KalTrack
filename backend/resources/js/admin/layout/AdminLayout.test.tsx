import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminLayout } from '@admin/layout/AdminLayout';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A scorrere e' il contenuto, non il documento.
 *
 * Non e' una preferenza di stile: e' il rimedio allo sfarfallio in cima a ogni
 * apertura di modulo. Ant Design, aprendo un drawer, scrive sul body
 * `width: calc(100% - Npx)` per compensare una barra di scorrimento che
 * `overflow: hidden` sul body **non** toglie, e il body si stringe per niente.
 * Con il documento che non scorre, `ScrollLocker` trova il body gia' a
 * `overflow: hidden`, lascia la misura a zero e non scrive nessuna larghezza.
 *
 * Il difetto dipende da un'impostazione di sistema - con le barre a
 * sovrapposizione la misura e' zero e non si vede niente - quindi questi due
 * test sono l'unico posto che se ne accorge su una macchina qualunque.
 * Il gemello lato server e' `AdminShellTest`, che guarda il CSS del guscio.
 */
const monta = (): void => {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <AuthProvider>
                    <AdminLayout />
                </AuthProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
};

describe('AdminLayout, lo scorrimento', () => {
    it('lo scorrimento sta sul contenuto', () => {
        monta();

        const contenuto = document.querySelector('[data-scroll="contenuto"]');

        expect(contenuto).not.toBeNull();
        expect((contenuto as HTMLElement).style.overflowY).toBe('auto');
    });

    /*
     * `minHeight` era il valore di prima, e rimetterlo basta a riaprire il
     * difetto: il guscio cresce oltre la finestra, il documento torna a
     * scorrere e il blocco ricomincia a misurare la barra.
     */
    it('il guscio e alto la finestra, non di piu', () => {
        monta();

        const guscio = document.querySelector('.ant-layout');

        expect(guscio).not.toBeNull();
        expect((guscio as HTMLElement).style.height).toBe('100%');
        expect((guscio as HTMLElement).style.minHeight).toBe('');
    });

    /* Il menu deve poter scorrere per conto suo, o alla settima voce su una
     * finestra bassa l'ultima non si raggiungerebbe: il documento non scorre
     * piu' a rimediare. */
    it('il menu laterale scorre per conto suo', () => {
        monta();

        const barra = document.querySelector('.ant-layout-sider');

        expect(barra).not.toBeNull();
        expect((barra as HTMLElement).style.overflowY).toBe('auto');
    });

    it('le voci del menu restano dei link veri, per il cmd+click', () => {
        monta();

        expect(screen.getByRole('link', { name: 'Esercizi' })).toHaveProperty(
            'tagName',
            'A',
        );
    });
});
