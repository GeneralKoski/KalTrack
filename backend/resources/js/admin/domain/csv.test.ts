import { describe, expect, it } from 'vitest';
import { joinCsv, splitCsv } from '@admin/domain/csv';

describe('gli elenchi in colonna', () => {
    it('spacchetta una colonna separata da virgole', () => {
        expect(splitCsv('bilanciere,panca')).toEqual(['bilanciere', 'panca']);
    });

    it('una colonna vuota o assente vale elenco vuoto, non [""]', () => {
        expect(splitCsv(null)).toEqual([]);
        expect(splitCsv('')).toEqual([]);
    });

    it('rimpacchetta scartando i vuoti', () => {
        expect(joinCsv(['bilanciere', ' ', 'panca'])).toBe('bilanciere,panca');
    });

    it('un elenco vuoto torna null e non stringa vuota', () => {
        expect(joinCsv([])).toBeNull();
        expect(joinCsv(undefined)).toBeNull();
    });
});
