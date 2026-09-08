import { describe, expect, it } from 'vitest';
import { kcalFromMacros, macrosDiverge } from '@admin/domain/nutrition';

describe('le kcal dai macro', () => {
    it('conta 4 per proteine e carboidrati, 9 per i grassi', () => {
        expect(kcalFromMacros(10, 20, 5)).toBe(165);
    });

    it('un macro non dichiarato vale zero, non fa fallire il conto', () => {
        expect(kcalFromMacros(10, null, null)).toBe(40);
        expect(kcalFromMacros(null, null, null)).toBe(0);
    });

    it('arrotonda: i decimali di un valore per 100 g non si leggono', () => {
        expect(kcalFromMacros(1.1, 1.1, 1.1)).toBe(19);
    });
});

describe('macrosDiverge', () => {
    it('tace su uno scarto piccolo: fibre e alcol non stanno nella formula', () => {
        expect(macrosDiverge(170, 165)).toBe(false);
    });

    it('avvisa quando lo scarto e\' grosso', () => {
        expect(macrosDiverge(400, 165)).toBe(true);
    });

    it('tace finche\' i macro non ci sono: senza, ogni alimento nuovo nasce con un avviso', () => {
        expect(macrosDiverge(400, 0)).toBe(false);
    });

    it('tace su un valore piccolo con uno scarto piccolo in assoluto', () => {
        expect(macrosDiverge(30, 15)).toBe(false);
    });
});
