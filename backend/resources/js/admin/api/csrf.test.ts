import { describe, expect, it } from 'vitest';
import { readCookie } from '@admin/api/csrf';

describe('readCookie', () => {
    it('trova il token fra gli altri cookie', () => {
        const cookie = 'kaltrack_session=abc; XSRF-TOKEN=xyz; altro=1';

        expect(readCookie(cookie, 'XSRF-TOKEN')).toBe('xyz');
    });

    it('decodifica il valore, che Laravel scrive url-encodato', () => {
        expect(readCookie('XSRF-TOKEN=ab%3Dcd%2B', 'XSRF-TOKEN')).toBe('ab=cd+');
    });

    it('torna null quando il cookie non c\'e\'', () => {
        expect(readCookie('altro=1', 'XSRF-TOKEN')).toBeNull();
    });

    it('non confonde un cookie il cui nome finisce come quello cercato', () => {
        expect(readCookie('MIO-XSRF-TOKEN=no; XSRF-TOKEN=si', 'XSRF-TOKEN')).toBe('si');
    });
});
