import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsersPage } from '@admin/pages/UsersPage';

const UTENTI = {
    users: [
        {
            id: 3,
            handle: 'tizio',
            displayName: 'Tizio',
            email: 't@example.com',
            isAdmin: false,
            aiEnabled: true,
            createdAt: '2026-01-05T09:00:00+00:00',
            submitted: 4,
            published: 2,
        },
    ],
};

const monta = (): ReturnType<typeof vi.fn> => {
    const finta = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(UTENTI), { status: 200 }));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <UsersPage />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('UsersPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca gli iscritti con proposte fatte e approvate', async () => {
        monta();

        expect(await screen.findByText('tizio')).toBeDefined();
        expect(screen.getByText('2 su 4')).toBeDefined();
    });

    it('l\'interruttore IA manda una PATCH', async () => {
        const finta = monta();

        await userEvent.click(await screen.findByRole('switch'));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find((c) => c[0] === '/api/admin/users/3');
            expect(chiamata?.[1].method).toBe('PATCH');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({ aiEnabled: false });
        });
    });
});
