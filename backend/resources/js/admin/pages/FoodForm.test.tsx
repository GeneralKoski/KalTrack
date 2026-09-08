import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FoodForm } from '@admin/pages/FoodForm';
import type { FoodRow } from '@admin/api/types';

const ALIMENTO: FoodRow = {
    id: 7,
    uid: 'fd-yogurt-bianco',
    name: 'Yogurt bianco',
    brand: 'Fattorie Alpine',
    barcode: null,
    offId: null,
    kcal: 60,
    protein: 4,
    carbs: 5,
    sugars: 5,
    fat: 2,
    saturatedFat: 1,
    fiber: 0,
    salt: 0.1,
    isLiquid: true,
    defaultServingG: 125,
    servingLabel: null,
    image: null,
    status: 'published',
    createdAt: null,
    updatedAt: null,
};

const monta = (riga: FoodRow | null = null): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <FoodForm riga={riga} aperto onChiudi={() => {}} />
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('FoodForm', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    });

    it('dice quante kcal spiegano i macro scritti', async () => {
        monta();

        await userEvent.type(screen.getByLabelText('Proteine (g)'), '10');
        await userEvent.type(screen.getByLabelText('Carboidrati (g)'), '20');
        await userEvent.type(screen.getByLabelText('Grassi (g)'), '5');

        expect(await screen.findByText(/165 kcal/)).toBeDefined();
    });

    it('avvisa quando le kcal scritte litigano con i macro', async () => {
        monta();

        await userEvent.type(screen.getByLabelText('Proteine (g)'), '10');
        await userEvent.type(screen.getByLabelText('Carboidrati (g)'), '20');
        await userEvent.type(screen.getByLabelText('Grassi (g)'), '5');
        await userEvent.type(screen.getByLabelText('Energia (kcal)'), '400');

        expect(await screen.findByText(/non tornano con i macro/)).toBeDefined();
    });

    // Regressione: `Input` svuotato manda `''`, non `null` come fa gia'
    // `InputNumber` alla cancellazione - un'asimmetria di antd, non nostra.
    // Sulla Marca si vedeva in tabella: la cella restava vuota invece di
    // mostrare il trattino di "nessuna marca".
    it('un campo di testo svuotato si manda come null, non come stringa vuota', async () => {
        const finta = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
        vi.stubGlobal('fetch', finta);
        monta(ALIMENTO);

        const campoMarca = await screen.findByLabelText('Marca');
        await userEvent.clear(campoMarca);
        await userEvent.click(screen.getByRole('button', { name: 'Salva' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find((c) => c[0] === '/api/admin/foods/7');
            expect(chiamata).toBeDefined();
            const corpo = JSON.parse(chiamata?.[1].body as string) as { brand: unknown };
            expect(corpo.brand).toBeNull();
        });
    });
});
