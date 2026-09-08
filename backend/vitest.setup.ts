import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/*
 * jsdom non ha `matchMedia` ne' `ResizeObserver`, e AntD li interroga appena
 * monta un Layout o una Table: senza questi due stub ogni test muore prima
 * della prima asserzione, con un errore che parla di una funzione mancante e
 * non del componente in prova.
 */
window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
});

class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

window.ResizeObserver = ResizeObserverStub;

afterEach(() => {
    cleanup();
});
