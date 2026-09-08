import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FoodForm } from '@admin/pages/FoodForm';

const monta = (): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <FoodForm riga={null} aperto onChiudi={() => {}} />
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
});
