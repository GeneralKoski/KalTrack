import { describe, expect, it } from 'vitest';
import { numeroPagina } from '@admin/domain/pagina';

describe('numeroPagina', () => {
    it('legge la pagina scritta nella URL', () => {
        expect(numeroPagina('3')).toBe(3);
    });

    it('senza il parametro sta alla prima', () => {
        expect(numeroPagina(null)).toBe(1);
    });

    it('non fa passare un NaN', () => {
        // Andava nella query verso il server e in `current` della tabella:
        // due posti che un NaN non se lo aspettano.
        expect(numeroPagina('abc')).toBe(1);
    });

    it('scarta quel che non e\' una pagina', () => {
        expect(numeroPagina('0')).toBe(1);
        expect(numeroPagina('-2')).toBe(1);
        expect(numeroPagina('1.5')).toBe(1);
        expect(numeroPagina('')).toBe(1);
    });
});
