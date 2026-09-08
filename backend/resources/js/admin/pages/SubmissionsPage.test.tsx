import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SubmissionsPage } from '@admin/pages/SubmissionsPage';

/* Zero esercizi in coda e tre alimenti: il caso che contraddiceva. */
const STATS = {
    users: 4,
    pending: { exercises: 0, foods: 3 },
    published: { exercises: 200, foods: 193 },
    missing: { instructions: 0, photos: 0 },
};

const monta = (percorso: string): void => {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) =>
            Promise.resolve(
                new Response(
                    JSON.stringify(url === '/api/admin/stats' ? STATS : { data: [] }),
                    { status: 200 },
                ),
            ),
        ),
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <RouterProvider
                    router={createMemoryRouter([{ path: '/proposte', element: <SubmissionsPage /> }], {
                        initialEntries: [percorso],
                    })}
                />
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('SubmissionsPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    /*
     * La dashboard somma i due tipi in un riquadro solo e il suo link non
     * porta un `type`, quindi si atterra su Esercizi: con zero esercizi e tre
     * alimenti in coda la dashboard diceva tre e qui non si vedeva niente.
     */
    it('dice su quale tipo sta il lavoro', async () => {
        monta('/proposte');

        expect(await screen.findByText('Alimenti (3)')).toBeDefined();
        expect(screen.getByText('Esercizi (0)')).toBeDefined();
    });

    /*
     * Il vuoto parla del tipo che si sta guardando: "il catalogo e' in pari"
     * era un'affermazione su tutta la coda ricavata da una query filtrata su
     * meta'.
     */
    it('il vuoto parla del tipo guardato, non della coda intera', async () => {
        monta('/proposte?type=exercise');

        expect(await screen.findByText('Niente in attesa fra gli esercizi.')).toBeDefined();
        expect(screen.queryByText('Niente in attesa. Il catalogo e\' in pari.')).toBeNull();
    });
});
