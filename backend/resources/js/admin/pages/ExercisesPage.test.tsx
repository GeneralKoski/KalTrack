import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ExercisesPage } from '@admin/pages/ExercisesPage';

const ESERCIZI = {
    data: [
        {
            id: 1,
            uid: 'ex-panca-piana-bilanciere',
            name: 'Panca piana',
            muscleGroup: 'petto',
            secondaryMuscles: 'tricipiti',
            equipment: 'bilanciere,panca',
            instructions: null,
            photo: null,
            status: 'published',
            createdAt: null,
            updatedAt: null,
        },
    ],
    meta: { total: 1, page: 1, lastPage: 1 },
};

const GRUPPI = { data: [{ id: 1, slug: 'petto', labelIt: 'Petto', labelEn: 'Chest', sort: 10 }] };

const rispondi = (url: string): Response =>
    new Response(JSON.stringify(url.startsWith('/api/admin/taxonomies') ? GRUPPI : ESERCIZI), {
        status: 200,
    });

const monta = (percorso: string): ReturnType<typeof vi.fn> => {
    const finta = vi.fn().mockImplementation((url: string) => Promise.resolve(rispondi(url)));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <RouterProvider
                    router={createMemoryRouter([{ path: '/esercizi', element: <ExercisesPage /> }], {
                        initialEntries: [percorso],
                    })}
                />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('ExercisesPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca gli esercizi e traduce lo slug del gruppo', async () => {
        monta('/esercizi');

        expect(await screen.findByText('Panca piana')).toBeDefined();
        expect(await screen.findByText('Petto')).toBeDefined();
    });

    it('porta nella richiesta il filtro che arriva dalla URL', async () => {
        const finta = monta('/esercizi?missing=instructions');

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].startsWith('/api/admin/exercises'),
            );
            expect(chiamata?.[0]).toContain('missing=instructions');
        });
    });
});
