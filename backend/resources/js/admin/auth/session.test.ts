import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, login } from '@admin/auth/session';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

describe('la sessione', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('riconosce un amministratore', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                risposta(200, {
                    handle: 'martin',
                    displayName: 'Martin',
                    email: 'm@example.com',
                    isAdmin: true,
                }),
            ),
        );

        await expect(fetchMe()).resolves.toMatchObject({ handle: 'martin', isAdmin: true });
    });

    it('torna null senza sessione, invece di lanciare', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' })));

        await expect(fetchMe()).resolves.toBeNull();
    });

    it('torna null per una sessione che non e\' di un amministratore', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                risposta(200, {
                    handle: 'tizio',
                    displayName: 'Tizio',
                    email: 't@example.com',
                    isAdmin: false,
                }),
            ),
        );

        await expect(fetchMe()).resolves.toBeNull();
    });

    it('accede su /admin/login e non su /api/login', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(200, { handle: 'martin' }));
        vi.stubGlobal('fetch', finta);

        await login({ login: 'martin', password: 'segreta' });

        expect(finta.mock.calls[0][0]).toBe('/admin/login');
    });
});
