import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { creaQueryClient } from '@admin/app';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { rotte } from '@admin/router';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

const ME = {
    handle: 'martin',
    displayName: 'Martin',
    email: 'm@example.com',
    isAdmin: true,
};

const VUOTA = { data: [], meta: { total: 0, page: 1, lastPage: 1 } };

const STATS = {
    users: 1,
    pending: { exercises: 0, foods: 0 },
    published: { exercises: 200, foods: 193 },
    missing: { instructions: 0, photos: 0 },
};

/** Quel che il server risponderebbe a una pagina qualunque, sessione viva. */
const daServer = (url: string): Response =>
    url === '/api/admin/stats' ? risposta(200, STATS) : risposta(200, VUOTA);

/*
 * Il client e' quello vero (`creaQueryClient`) e non uno costruito qui: e'
 * lui che sa cosa fare di un 401, e provare le rotte con un client diverso
 * vorrebbe dire provare un pannello che non esiste.
 */
const monta = (percorso: string): void => {
    render(
        <AntApp>
            <QueryClientProvider client={creaQueryClient()}>
                <AuthProvider>
                    <RouterProvider
                        router={createMemoryRouter(rotte, { initialEntries: [percorso] })}
                    />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('il router', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('manda al login chi non e\' entrato', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' })));
        monta('/esercizi');

        expect(await screen.findByRole('button', { name: 'Entra' })).toBeDefined();
    });

    it('disegna la pagina chiesta a chi e\' entrato', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) =>
                Promise.resolve(url === '/api/me' ? risposta(200, ME) : daServer(url)),
            ),
        );
        monta('/tassonomie');

        expect(await screen.findByRole('heading', { name: 'Tassonomie' })).toBeDefined();
    });

    /*
     * Il passaggio, che e' la cosa che i due test sopra non provavano: loro
     * verificano i due capi statici - fuori si vede il login, dentro si vede
     * la pagina - e in mezzo ci stava un pannello in cui, entrando davvero,
     * non si entrava. Le credenziali venivano accettate e si restava a
     * guardare il modulo compilato.
     */
    it('dopo l\'accesso porta dentro invece di lasciare il modulo', async () => {
        let dentro = false;
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) => {
                if (url === '/admin/login') {
                    dentro = true;

                    return Promise.resolve(risposta(200, { ok: true }));
                }

                if (url === '/api/me') {
                    return Promise.resolve(
                        dentro ? risposta(200, ME) : risposta(401, { message: 'Unauthenticated.' }),
                    );
                }

                return Promise.resolve(daServer(url));
            }),
        );
        monta('/login');

        await userEvent.type(await screen.findByLabelText('Handle o email'), 'martin');
        await userEvent.type(screen.getByLabelText('Password'), 'segreta');
        await userEvent.click(screen.getByRole('button', { name: 'Entra' }));

        expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeDefined();
        expect(screen.queryByRole('button', { name: 'Entra' })).toBeNull();
    });

    /*
     * L'uscita, e per la stessa ragione: `queryClient.clear()` distruggeva la
     * sessione sul server e non avvisava l'observer sottoscritto, quindi il
     * pannello restava disegnato come se niente fosse - il nome
     * dell'amministratore in testa compreso.
     */
    it('uscendo si torna al modulo di accesso', async () => {
        let dentro = true;
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) => {
                if (url === '/admin/logout') {
                    dentro = false;

                    return Promise.resolve(risposta(200, { ok: true }));
                }

                if (url === '/api/me') {
                    return Promise.resolve(
                        dentro ? risposta(200, ME) : risposta(401, { message: 'Unauthenticated.' }),
                    );
                }

                return Promise.resolve(daServer(url));
            }),
        );
        monta('/');

        await userEvent.click(await screen.findByRole('button', { name: /Esci/ }));

        expect(await screen.findByRole('button', { name: 'Entra' })).toBeDefined();
        await waitFor(() => {
            expect(screen.queryByText('Martin')).toBeNull();
        });
    });

    /*
     * Una sessione morta mentre si guarda un elenco: prima diventava un
     * elenco vuoto, perche' `retry: false` faceva del 401 un errore che
     * nessuna delle cinque pagine leggeva. "La tua sessione e' scaduta" e
     * "il catalogo e' vuoto" si disegnavano identici.
     */
    it('un 401 su un elenco riporta al modulo di accesso, non a una tabella vuota', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) =>
                Promise.resolve(
                    url === '/api/me'
                        ? risposta(200, ME)
                        : risposta(401, { message: 'La sessione e\' scaduta: rientra.' }),
                ),
            ),
        );
        monta('/esercizi');

        expect(await screen.findByRole('button', { name: 'Entra' })).toBeDefined();
        expect(screen.queryByText('Nessun dato')).toBeNull();
    });
});
