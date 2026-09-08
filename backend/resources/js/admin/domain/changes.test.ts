import { describe, expect, it } from 'vitest';
import { changedFields } from '@admin/domain/changes';

describe('changedFields', () => {
    it('senza correzioni non manda niente', () => {
        expect(changedFields({ name: 'Riso', kcal: 350 }, { name: 'Riso', kcal: 350 })).toEqual({});
    });

    it('manda solo il campo corretto', () => {
        expect(changedFields({ name: 'Riso', kcal: 350 }, { name: 'Riso basmati', kcal: 350 })).toEqual({
            name: 'Riso basmati',
        });
    });

    it('distingue null da stringa vuota: sono due cose diverse in colonna', () => {
        expect(changedFields({ brand: null }, { brand: '' })).toEqual({ brand: '' });
    });

    it('un campo passato a null e\' una correzione, non un campo assente', () => {
        expect(changedFields({ brand: 'Lidl' }, { brand: null })).toEqual({ brand: null });
    });

    it('ignora le chiavi che il form non ha toccato affatto', () => {
        expect(changedFields({ name: 'Riso', kcal: 350 }, { name: 'Riso' })).toEqual({});
    });
});
