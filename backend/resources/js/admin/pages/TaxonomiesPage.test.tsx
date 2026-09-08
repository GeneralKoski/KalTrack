import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaxonomiesPage } from '@admin/pages/TaxonomiesPage';

const GRUPPI = {
    data: [
        { id: 1, slug: 'petto', labelIt: 'Petto', labelEn: 'Chest', sort: 10 },
        { id: 2, slug: 'dorso', labelIt: 'Dorso', labelEn: 'Back', sort: 20 },
    ],
};

const monta = (): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <TaxonomiesPage />
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('TaxonomiesPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca i gruppi muscolari', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(GRUPPI), { status: 200 })),
        );
        monta();

        expect(await screen.findByText('Petto')).toBeDefined();
        expect(screen.getByText('dorso')).toBeDefined();
    });

    it('in correzione lo slug non si tocca', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(GRUPPI), { status: 200 })),
        );
        monta();

        await userEvent.click((await screen.findAllByRole('button', { name: 'Correggi' }))[0]);

        await waitFor(() => {
            expect(screen.getByLabelText('Identificativo').hasAttribute('disabled')).toBe(true);
        });
    });

    it('mostra il motivo quando il server rifiuta la cancellazione', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: string, init?: { method?: string }) =>
                Promise.resolve(
                    init?.method === 'DELETE'
                        ? new Response(
                              JSON.stringify({ message: 'Ci sono ancora 12 voci che usano questo identificativo.' }),
                              { status: 422 },
                          )
                        : new Response(JSON.stringify(GRUPPI), { status: 200 }),
                ),
            ),
        );
        monta();

        /*
         * `ActionButton` di AntD rilancia l'errore di `onOk` come rifiuto non
         * gestito apposta (e' il comportamento descritto nel loro stesso
         * codice, issue ant-design/ant-design#6183): serve a non inghiottirlo
         * in silenzio, ma qui lo si e' gia' letto dal messaggio a schermo, e
         * Vitest lo segnerebbe come errore di processo se nessuno lo
         * raccoglie.
         */
        const raccogli = (): void => {};
        process.on('unhandledRejection', raccogli);

        try {
            await userEvent.click((await screen.findAllByRole('button', { name: 'Elimina' }))[0]);

            // Con due righe in elenco il bottone "Elimina" compare gia' due
            // volte prima ancora di aprire la finestra: quello di conferma va
            // cercato dentro il dialogo, non nell'elenco intero.
            const dialogo = await screen.findByRole('dialog');
            await userEvent.click(within(dialogo).getByRole('button', { name: 'Elimina' }));

            expect(
                await screen.findByText('Ci sono ancora 12 voci che usano questo identificativo.'),
            ).toBeDefined();
        } finally {
            process.off('unhandledRejection', raccogli);
        }
    });
});
