import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@admin/api/client';
import { ApiError } from '@admin/api/errors';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(corpo === null ? '' : JSON.stringify(corpo), { status });

describe('apiFetch', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('legge il JSON di una risposta riuscita', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta(200, { data: [1, 2] })));

        await expect(apiFetch<{ data: number[] }>('/api/admin/stats')).resolves.toEqual({
            data: [1, 2],
        });
    });

    it('manda il token CSRF su tutto cio\' che non e\' una lettura', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(200, { ok: true }));
        vi.stubGlobal('fetch', finta);

        await apiFetch('/api/admin/foods/1', { method: 'PATCH', body: { name: 'Riso' } });

        const [, init] = finta.mock.calls[0];
        expect(init.headers['X-XSRF-TOKEN']).toBe('tok');
        expect(init.headers['Content-Type']).toBe('application/json');
        expect(init.body).toBe('{"name":"Riso"}');
    });

    it('non manda il token su una lettura', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(200, {}));
        vi.stubGlobal('fetch', finta);

        await apiFetch('/api/admin/users');

        const [, init] = finta.mock.calls[0];
        expect(init.headers['X-XSRF-TOKEN']).toBeUndefined();
    });

    it('trasforma un 422 in un ApiError che porta i campi', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                risposta(422, {
                    message: 'C\'e\' gia\' un alimento con questo nome.',
                    errors: { name: ['Nome gia\' in catalogo.'] },
                }),
            ),
        );

        const errore = await apiFetch('/api/admin/foods', { method: 'POST', body: {} }).catch(
            (e: unknown) => e,
        );

        expect(errore).toBeInstanceOf(ApiError);
        expect((errore as ApiError).status).toBe(422);
        expect((errore as ApiError).errors.name).toEqual(['Nome gia\' in catalogo.']);
    });

    it('rinfresca il cookie e riprova UNA volta su un 419', async () => {
        const finta = vi
            .fn()
            .mockResolvedValueOnce(risposta(419, { message: 'CSRF token mismatch.' }))
            .mockResolvedValueOnce(risposta(200, {})) // il /sanctum/csrf-cookie
            .mockResolvedValueOnce(risposta(200, { ok: true }));
        vi.stubGlobal('fetch', finta);

        await expect(apiFetch('/api/admin/users/1', { method: 'PATCH', body: {} })).resolves.toEqual(
            { ok: true },
        );
        expect(finta).toHaveBeenCalledTimes(3);
    });

    it('non pretende JSON da una pagina di errore del server', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('<html>Server Error</html>', { status: 500 })),
        );

        const errore = await apiFetch('/api/admin/stats').catch((e: unknown) => e);

        expect(errore).toBeInstanceOf(ApiError);
        expect((errore as ApiError).status).toBe(500);
    });

    it('un 200 illeggibile e\' un errore, non un risultato vuoto', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('<html>non e\' JSON</html>', { status: 200 })),
        );

        const errore = await apiFetch('/api/admin/stats').catch((e: unknown) => e);

        expect(errore).toBeInstanceOf(ApiError);
        expect((errore as ApiError).status).toBe(200);
    });

    it('un 200 senza corpo continua a funzionare', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));

        await expect(apiFetch('/api/admin/foods/1', { method: 'DELETE' })).resolves.toBeNull();
    });
});
