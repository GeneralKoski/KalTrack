import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminApp } from '@admin/app';

describe('AdminApp', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Unauthenticated.' }), { status: 401 })),
        );
    });

    it('monta i provider e, senza sessione, mostra il login', async () => {
        render(<AdminApp />);

        expect(await screen.findByRole('button', { name: 'Entra' })).toBeDefined();
    });
});
