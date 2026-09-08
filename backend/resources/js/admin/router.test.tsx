import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { rotte } from '@admin/router';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

const monta = (percorso: string): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <AuthProvider>
                    <RouterProvider router={createMemoryRouter(rotte, { initialEntries: [percorso] })} />
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
                Promise.resolve(
                    url === '/api/me'
                        ? risposta(200, {
                              handle: 'martin',
                              displayName: 'Martin',
                              email: 'm@example.com',
                              isAdmin: true,
                          })
                        : risposta(200, { data: [], meta: { total: 0, page: 1, lastPage: 1 } }),
                ),
            ),
        );
        monta('/tassonomie');

        expect(await screen.findByRole('heading', { name: 'Tassonomie' })).toBeDefined();
    });
});
