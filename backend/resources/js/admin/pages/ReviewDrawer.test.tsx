import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewDrawer } from '@admin/pages/ReviewDrawer';
import type { SubmissionRow } from '@admin/api/types';

const PROPOSTA: SubmissionRow = {
    id: 12,
    type: 'food',
    uid: 'f-1',
    name: 'Riso',
    status: 'pending',
    reviewNote: null,
    createdAt: '2026-09-01T10:00:00+00:00',
    author: { handle: 'tizio', displayName: 'Tizio' },
    fields: {
        brand: null,
        barcode: null,
        offId: null,
        kcal: 350,
        protein: 7,
        carbs: 78,
        sugars: null,
        fat: 1,
        saturatedFat: null,
        fiber: null,
        salt: null,
        isLiquid: false,
        defaultServingG: null,
        servingLabel: null,
        image: null,
    },
};

// Il gemello per esercizio: `secondaryMuscles` e `equipment` sono le due
// colonne a virgole, scritte come le scrive il telefono - senza spazi.
const PROPOSTA_ESERCIZIO: SubmissionRow = {
    id: 34,
    type: 'exercise',
    uid: 'e-1',
    name: 'Squat con bilanciere',
    status: 'pending',
    reviewNote: null,
    createdAt: '2026-09-01T10:00:00+00:00',
    author: { handle: 'caio', displayName: 'Caio' },
    fields: {
        muscleGroup: 'quadricipiti',
        secondaryMuscles: 'glutei,femorali',
        equipment: 'bilanciere,rack',
        instructions: 'Scendi controllando il bilanciere.',
    },
};

const monta = (proposta: SubmissionRow = PROPOSTA): ReturnType<typeof vi.fn> => {
    const finta = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <ReviewDrawer proposta={proposta} aperto onChiudi={() => {}} />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('ReviewDrawer', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('dice chi ha proposto: e\' l\'unico posto dove si vede', async () => {
        monta();

        expect(await screen.findByText('Tizio')).toBeDefined();
    });

    it('approvando manda SOLO il campo corretto', async () => {
        const finta = monta();

        const nome = await screen.findByLabelText('Nome');
        await userEvent.clear(nome);
        await userEvent.type(nome, 'Riso basmati');
        await userEvent.click(screen.getByRole('button', { name: 'Approva' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].includes('/approve'),
            );
            expect(chiamata?.[0]).toBe('/api/admin/submissions/food/12/approve');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({ name: 'Riso basmati' });
        });
    });

    // Il caso che override 5 esiste per coprire: aprire, non toccare niente,
    // approvare. Se la normalizzazione tornasse a girare DOPO il confronto
    // invece che prima, questo test lo direbbe - il corpo non sarebbe piu'
    // vuoto ma porterebbe `brand: ''`.
    it('approvando senza toccare niente non manda nessuna correzione (alimento)', async () => {
        const finta = monta();

        await screen.findByLabelText('Nome');
        await userEvent.click(screen.getByRole('button', { name: 'Approva' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].includes('/approve'),
            );
            expect(chiamata?.[0]).toBe('/api/admin/submissions/food/12/approve');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({});
        });
    });

    // Il gemello per esercizio: qui a stare fermo e' il giro
    // splitCsv/joinCsv, non solo la normalizzazione del testo. Le due colonne
    // a virgole tornano com'erano solo perche' l'app le scrive senza spazi -
    // se un giorno non fosse cosi', questo test se ne accorgerebbe.
    it('approvando senza toccare niente non manda nessuna correzione (esercizio)', async () => {
        const finta = monta(PROPOSTA_ESERCIZIO);

        await screen.findByLabelText('Nome');
        await userEvent.click(screen.getByRole('button', { name: 'Approva' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].includes('/approve'),
            );
            expect(chiamata?.[0]).toBe('/api/admin/submissions/exercise/34/approve');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({});
        });
    });

    it('rifiutare senza una nota non si puo\': la nota e\' l\'unica cosa che resta all\'autore', async () => {
        const finta = monta();

        await userEvent.click(await screen.findByRole('button', { name: 'Rifiuta' }));

        await waitFor(() => {
            expect(screen.getByText('Scrivi perche\' viene rifiutata.')).toBeDefined();
        });
        expect(
            finta.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('/reject')),
        ).toBeUndefined();
    });
});
