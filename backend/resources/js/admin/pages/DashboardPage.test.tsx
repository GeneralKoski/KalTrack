import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { DashboardPage } from '@admin/pages/DashboardPage';

const STATS = {
    users: 7,
    pending: { exercises: 3, foods: 2 },
    published: { exercises: 200, foods: 193 },
    missing: { instructions: 128, photos: 200 },
};

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(STATS), { status: 200 })),
        );
    });

    it('mostra le proposte in attesa sommando i due tipi', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <AntApp>
                <QueryClientProvider client={client}>
                    <RouterProvider
                        router={createMemoryRouter([{ path: '/', element: <DashboardPage /> }])}
                    />
                </QueryClientProvider>
            </AntApp>,
        );

        expect(await screen.findByText('Proposte in attesa')).toBeDefined();
        expect(screen.getByText('5')).toBeDefined();
        expect(screen.getByText('128')).toBeDefined();
    });
});
