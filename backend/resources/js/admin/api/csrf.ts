/** Il nome del cookie che Laravel lascia al JavaScript. */
export const CSRF_COOKIE = 'XSRF-TOKEN';

/**
 * Legge un cookie da una stringa `document.cookie`.
 *
 * Prende la stringa invece di leggerla da sola perche' cosi' si prova senza
 * un DOM. Il confronto e' sul nome INTERO: uno `startsWith` prenderebbe
 * `MIO-XSRF-TOKEN` per `XSRF-TOKEN`, e da li' in poi si manderebbe al server
 * il token sbagliato con un 419 che non si spiega.
 */
export function readCookie(source: string, name: string): string | null {
    for (const parte of source.split(';')) {
        const separatore = parte.indexOf('=');

        if (separatore === -1) {
            continue;
        }

        if (parte.slice(0, separatore).trim() !== name) {
            continue;
        }

        return decodeURIComponent(parte.slice(separatore + 1).trim());
    }

    return null;
}

/**
 * Il token da mandare in `X-XSRF-TOKEN`, chiedendolo al server se non c'e'.
 *
 * Laravel scrive il cookie url-encodato e si aspetta di rivederlo
 * decodificato nell'header: e' l'unico passaggio del giro Sanctum SPA in cui
 * il valore cambia forma, ed e' quello che si sbaglia.
 */
export async function ensureCsrfToken(): Promise<string | null> {
    const gia = readCookie(document.cookie, CSRF_COOKIE);

    if (gia !== null) {
        return gia;
    }

    await fetch('/sanctum/csrf-cookie', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });

    return readCookie(document.cookie, CSRF_COOKIE);
}
