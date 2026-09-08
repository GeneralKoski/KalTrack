import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { creaQueryClient } from '@admin/app';
import { LoginPage } from '@admin/auth/LoginPage';
import { AuthProvider } from '@admin/auth/AuthProvider';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

/*
 * Un router c'e' anche qui, e non e' una cerimonia: da quando la pagina
 * rimanda dentro chi e' gia' entrato, legge il percorso di ritorno da
 * `useLocation()` e senza un Router intorno non si monta affatto. Il router
 * di memoria e' lo stesso schema di `router.test.tsx`.
 */
const monta = (): void => {
    render(
        <AntApp>
            <QueryClientProvider client={creaQueryClient()}>
                <AuthProvider>
                    <RouterProvider
                        router={createMemoryRouter([{ path: '/login', element: <LoginPage /> }], {
                            initialEntries: ['/login'],
                        })}
                    />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('LoginPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('manda handle e password a /admin/login', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' }));
        vi.stubGlobal('fetch', finta);
        monta();

        await userEvent.type(screen.getByLabelText('Handle o email'), 'martin');
        await userEvent.type(screen.getByLabelText('Password'), 'segreta');
        await userEvent.click(screen.getByRole('button', { name: 'Entra' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find((c) => c[0] === '/admin/login');
            expect(chiamata).toBeDefined();
            expect(chiamata?.[1].body).toBe('{"login":"martin","password":"segreta"}');
        });
    });

    it('mostra sotto il campo l\'errore che il server manda', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) =>
                Promise.resolve(
                    url === '/admin/login'
                        ? risposta(422, {
                              message: 'Le credenziali non sono corrette.',
                              errors: { login: ['Le credenziali non sono corrette.'] },
                          })
                        : risposta(401, { message: 'Unauthenticated.' }),
                ),
            ),
        );
        monta();

        await userEvent.type(screen.getByLabelText('Handle o email'), 'martin');
        await userEvent.type(screen.getByLabelText('Password'), 'sbagliata');
        await userEvent.click(screen.getByRole('button', { name: 'Entra' }));

        /*
         * `findByText` da solo e' ambiguo: lo stesso messaggio compare anche
         * nel toast (`message.error`), e quale dei due il DOM abbia gia'
         * disegnato al momento dell'attesa dipende dai tempi di rendering -
         * un test che fallisce a intermittenza, a seconda di quale dei due
         * compare per primo. Qui si aspetta proprio l'elemento sotto il
         * campo, che AntD marca con questa classe, e non un testo qualunque.
         */
        await waitFor(() => {
            const errore = document.querySelector('.ant-form-item-explain-error');
            expect(errore?.textContent).toBe('Le credenziali non sono corrette.');
        });
    });
});
