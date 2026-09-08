import { ensureCsrfToken } from '@admin/api/csrf';
import { ApiError } from '@admin/api/errors';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiOptions {
    method?: Metodo;
    body?: Record<string, unknown> | FormData;
    signal?: AbortSignal;
}

/** Il messaggio di ripiego quando il server non ne ha mandato uno leggibile. */
function ripiego(status: number): string {
    if (status === 401) {
        return 'La sessione e\' scaduta: rientra.';
    }

    if (status === 403) {
        return 'Non sei autorizzato a fare questo.';
    }

    if (status === 404) {
        return 'Questa voce non esiste (piu\').';
    }

    return 'Il server non ha risposto come doveva.';
}

async function invia(
    path: string,
    method: Metodo,
    body: ApiOptions['body'],
    signal: AbortSignal | undefined,
): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (method !== 'GET') {
        const token = await ensureCsrfToken();

        if (token !== null) {
            headers['X-XSRF-TOKEN'] = token;
        }
    }

    let payload: BodyInit | undefined;

    if (body instanceof FormData) {
        // Nessun Content-Type: lo scrive il browser, con il boundary che
        // scrivendolo a mano non si conosce.
        payload = body;
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    return fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal });
}

async function leggi<T>(risposta: Response): Promise<T> {
    const testo = await risposta.text();
    let dati: unknown = null;

    if (testo !== '') {
        try {
            dati = JSON.parse(testo);
        } catch {
            // Non e' un catch silenzioso: il corpo illeggibile diventa un
            // ApiError con lo status vero, che e' l'informazione utile. Un
            // 500 rende una pagina HTML, e pretendere JSON da li' farebbe
            // vedere "Unexpected token <" al posto di "errore del server".
            dati = null;
        }
    }

    const corpo = dati as { message?: string; errors?: Record<string, string[]> } | null;

    if (!risposta.ok) {
        throw new ApiError(
            risposta.status,
            corpo?.message ?? ripiego(risposta.status),
            corpo?.errors ?? {},
        );
    }

    return dati as T;
}

/**
 * Una richiesta al server, col cookie di sessione e il token CSRF.
 *
 * `credentials: 'same-origin'` e non `include`: il pannello e il server sono
 * lo stesso host - la SPA la serve Laravel - e allargare la regola vorrebbe
 * dire mandare il cookie anche dove non serve.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const risposta = await invia(path, method, options.body, options.signal);

    /*
     * Un giro solo di recupero sul 419.
     *
     * `SESSION_LIFETIME` e' 120 minuti e il token ruota: una scheda lasciata
     * aperta si ritrova in mano un cookie vecchio, e senza questo ramo il
     * primo salvataggio dopo la pausa pranzo fallisce senza un motivo
     * leggibile. Se anche il secondo tentativo fallisce non e' il token, e'
     * la sessione, e lo si lascia dire al 401 che arrivera'.
     */
    if (risposta.status === 419) {
        await fetch('/sanctum/csrf-cookie', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        });

        return leggi<T>(await invia(path, method, options.body, options.signal));
    }

    return leggi<T>(risposta);
}
