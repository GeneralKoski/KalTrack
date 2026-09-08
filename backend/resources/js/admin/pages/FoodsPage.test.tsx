import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { FoodsPage } from '@admin/pages/FoodsPage';

const ALIMENTI = {
    data: [
        {
            id: 1,
            uid: 'fd-pasta',
            name: 'Pasta di semola',
            brand: null,
            barcode: null,
            offId: null,
            kcal: 350,
            protein: 12,
            carbs: 70,
            sugars: 3,
            fat: 1.5,
            saturatedFat: 0.5,
            fiber: 2,
            salt: 0.01,
            isLiquid: false,
            defaultServingG: 80,
            servingLabel: null,
            image: null,
            status: 'published',
            createdAt: null,
            updatedAt: null,
        },
    ],
    // 60 e non 1: con 50 per pagina serve una seconda pagina perche' il test
    // di paginazione qui sotto abbia un "2" su cui cliccare.
    meta: { total: 60, page: 1, lastPage: 2 },
};

const monta = (percorso: string): ReturnType<typeof vi.fn> => {
    const finta = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(ALIMENTI), { status: 200 })));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <RouterProvider
                    router={createMemoryRouter([{ path: '/alimenti', element: <FoodsPage /> }], {
                        initialEntries: [percorso],
                    })}
                />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('FoodsPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca gli alimenti', async () => {
        monta('/alimenti');

        expect(await screen.findByText('Pasta di semola')).toBeDefined();
    });

    // Regressione: `scrivi()` cancellava `page` due righe dopo averlo appena
    // scritto, quindi ogni clic su una pagina diversa dalla prima tornava
    // sempre alla prima. Con 60 righe e 50 per pagina la "2" esiste davvero.
    it('va alla seconda pagina e la porta nella richiesta', async () => {
        const finta = monta('/alimenti');

        await screen.findByText('Pasta di semola');

        await userEvent.click(screen.getByTitle('2'));

        await waitFor(() => {
            const ultima = finta.mock.calls
                .filter((c) => typeof c[0] === 'string' && c[0].startsWith('/api/admin/foods'))
                .at(-1);
            expect(ultima?.[0]).toContain('page=2');
        });
    });
});
