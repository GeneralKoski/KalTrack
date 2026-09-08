# Gestionale del catalogo, Fase 2: il pannello

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il segnaposto di nove righe in `backend/resources/js/admin/main.tsx` con il pannello vero - sette pagine React servite su `/admin`, che consumano le ventuno rotte `/api/admin/*` gia' vive dalla Fase 1.

**Architecture:** Una SPA dentro `backend/`, non un secondo deploy: Vite compila `resources/js/admin/main.tsx` nel `public/build` che il Dockerfile copia gia'. L'accesso e' a **sessione** Sanctum SPA (cookie `httpOnly` + `X-XSRF-TOKEN`), non a token: `POST /admin/login` esiste dalla Fase 1 e rifiuta chi non e' `is_admin`. React Router disegna le pagine dal percorso e il catch-all `GET /admin/{any?}` rende la stessa vista per ognuno. Le letture passano da TanStack Query, le scritture da mutation esplicite; nessun `useEffect` + `useState` per il fetch.

**Tech Stack:** Vite 8, React 19, TypeScript strict, Ant Design 5, React Router 7, TanStack Query 5, Vitest + Testing Library. Nessuna libreria di stato globale: il server e' lo stato, e la cache di Query e' l'unica copia.

**Spec:** `docs/superpowers/specs/2026-09-07-gestionale-catalogo-design.md` § Il gestionale

**Stato di partenza:** `.superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md`

## Global Constraints

- **Tutti i comandi si lanciano da `backend/`.** Il repo dell'app sta un livello sopra e non c'entra niente con questa fase: **nessun file fuori da `backend/` e da `docs/superpowers/plans/` viene toccato**, tranne i documenti elencati nel Task 11.
- **TypeScript strict, mai `any`.** `unknown` piu' un type guard. Mai `as` per zittire il compilatore: l'unica assertion ammessa e' quella su un JSON appena parsato, dentro `client.ts`, dove il tipo lo dichiara il chiamante.
- **Componenti solo funzionali**, arrow function tipizzata, un'`interface` per le props.
- **Data fetching: TanStack Query.** Mai `useEffect` + `useState` per leggere. Mai `fetch()` nudo in un componente: si passa sempre da `apiFetch`.
  - *Scostamento dichiarato dalle guide Dieffetech* (`docs/react/core.md` prescrive SWR, `CrudDataTable` e `DfProForm`): qui non esiste la libreria di componenti DF, e la spec ha scelto TanStack Query. Il resto della guida vale (Tailwind non c'e' in questo albero, quindi lo styling passa dai token AntD e da `style` solo dove AntD non offre una prop).
- **Ogni testo visibile e' in italiano**, come il resto del server. Il pannello non e' bilingue: lo usa una persona sola. Nessun i18n, e non e' una dimenticanza - `Accept-Language` resta quel che l'app manda, e il pannello parla la lingua di chi amministra.
- **I commenti si scrivono in italiano e spiegano il perche', non il cosa.** E' la voce di questo repository: guarda `SubmissionController` o `AdminAuthController` prima di scrivere.
- **Un errore 422 si vede in DUE posti**: il messaggio riassunto (`message`) in un toast, e i messaggi per campo (`errors`) sotto il campo giusto. E' cio' che la spec chiede espressamente ("AntD sa mettere il messaggio sotto il campo giusto dal corpo `errors`"), ed e' **il contrario** della regola dell'app in `CLAUDE.md` § Convenzioni non negoziabili, che vale per la app mobile e per `DfForm`. Chi trova questa differenza e la "uniforma" toglie l'unica indicazione precisa che il form da'.
- **Le colonne `equipment` e `secondary_muscles` sono elenchi separati da virgola in una stringa**, non array: il server le filtra con un LIKE su `',' || colonna || ','`. Il form le mostra come `Select mode="multiple"` e le converte ai bordi (`splitCsv` / `joinCsv`), mai a mano.
- **Una PATCH manda solo i campi cambiati.** I controller ammin fanno `array_key_exists` campo per campo apposta: mandare tutto rimetterebbe in gioco valori che nessuno ha toccato, e su `AdminFoodController` significherebbe azzerare le proteine mentre si corregge il sale.
- **Niente `console.*`**, niente import inutilizzati, niente codice commentato.
- **I test stanno accanto al file che provano** (`nutrition.test.ts` accanto a `nutrition.ts`) e hanno nomi italiani, come i test PHP.
- **Ogni commit chiude con** `Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr` come ogni altro commit di questo repository. Subject e body in inglese; nessun co-author.
- **I tre cancelli finali sono `npm run typecheck`, `npm test`, `npm run build`**, e vanno verdi alla fine di ogni task che tocca il TypeScript.

---

### Task 1: La cassetta degli attrezzi

Il segnaposto sparisce e al suo posto monta React vero con i suoi provider. Nessuna pagina ancora: questo task risponde a una domanda sola, "la catena Vite -> React -> AntD -> Vitest gira?", e la risposta e' un test che rende un componente e ci legge dentro.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/tsconfig.json`
- Modify: `backend/vite.config.js`
- Create: `backend/vitest.config.ts`
- Create: `backend/vitest.setup.ts`
- Modify: `backend/resources/js/admin/main.tsx`
- Create: `backend/resources/js/admin/app.tsx`
- Test: `backend/resources/js/admin/app.test.tsx`
- Modify: `backend/resources/views/admin.blade.php`
- Modify: `backend/Dockerfile`

**Interfaces:**
- Produces: l'alias `@admin/*` -> `resources/js/admin/*` (in `tsconfig.json`, `vite.config.js` e `vitest.config.ts`, tutti e tre o il build e i test divergono); il componente `AdminApp` esportato da `@admin/app`; gli script npm `typecheck`, `test`, `build`.

- [ ] **Step 1: Installa le dipendenze**

```bash
npm install react react-dom antd @ant-design/icons @ant-design/v5-patch-for-react-19 react-router-dom @tanstack/react-query
npm install -D @vitejs/plugin-react typescript @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/user-event
```

`@ant-design/v5-patch-for-react-19` non e' facoltativo: AntD 5 e' nato per React 18, e senza la patch i metodi statici (`message.success`, `Modal.confirm`) non montano niente su React 19. Si importa una volta sola, per prima, in `main.tsx`.

- [ ] **Step 2: Aggiungi gli script a `package.json`**

Nel blocco `scripts`, accanto a quelli che ci sono:

```json
        "typecheck": "tsc --noEmit",
        "test": "vitest run"
```

`build` resta `vite build` e **non** diventa `tsc && vite build`: il Dockerfile lancia `npm run build` in uno stadio che ha solo `package.json`, `vite.config.js`, `tsconfig.json` e `resources/`, e un typecheck dentro l'immagine renderebbe il deploy ostaggio di un errore di tipo in un test. Il typecheck e' un cancello dello sviluppo, non del deploy.

- [ ] **Step 3: Crea `backend/tsconfig.json`**

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "module": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "react-jsx",
        "strict": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noFallthroughCasesInSwitch": true,
        "noEmit": true,
        "skipLibCheck": true,
        "isolatedModules": true,
        "resolveJsonModule": true,
        "baseUrl": ".",
        "paths": {
            "@admin/*": ["resources/js/admin/*"]
        }
    },
    "include": ["resources/js/admin", "vitest.config.ts", "vitest.setup.ts"]
}
```

- [ ] **Step 4: Aggiungi il plugin React e l'alias a `backend/vite.config.js`**

Il file diventa:

```js
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import laravel from 'laravel-vite-plugin';
import { bunny } from 'laravel-vite-plugin/fonts';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/css/app.css', 'resources/js/app.js', 'resources/js/admin/main.tsx'],
            refresh: true,
            fonts: [
                bunny('Instrument Sans', {
                    weights: [400, 500, 600],
                }),
            ],
        }),
        react(),
        tailwindcss(),
    ],
    resolve: {
        // Lo stesso alias sta in `tsconfig.json` e in `vitest.config.ts`.
        // Sono tre file e un percorso solo: cambiarne uno e non gli altri
        // fa passare il typecheck e fallire il build, o viceversa.
        alias: {
            '@admin': fileURLToPath(new URL('./resources/js/admin', import.meta.url)),
        },
    },
    server: {
        watch: {
            ignored: ['**/storage/framework/views/**'],
        },
    },
});
```

- [ ] **Step 5: Crea `backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

/*
 * Una configurazione a se' e non il blocco `test` di `vite.config.js`: quella
 * monta `laravel-vite-plugin`, che cerca `.env`, l'entrypoint e il manifest,
 * cose che in un test non esistono e non devono esistere.
 */
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@admin': fileURLToPath(new URL('./resources/js/admin', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        include: ['resources/js/admin/**/*.test.{ts,tsx}'],
        restoreMocks: true,
        // `vi.stubGlobal('fetch', ...)` sopravvive al test che lo ha scritto
        // senza questa riga: il test dopo eredita le risposte finte del test
        // prima, e passa o fallisce per un motivo che non e' il suo.
        unstubGlobals: true,
    },
});
```

- [ ] **Step 6: Crea `backend/vitest.setup.ts`**

```ts
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
```

- [ ] **Step 7: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/app.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminApp } from '@admin/app';

describe('AdminApp', () => {
    it('monta i provider e disegna qualcosa', () => {
        render(<AdminApp />);

        expect(screen.getByText('Gestionale KalTrack')).toBeDefined();
    });
});
```

- [ ] **Step 8: Lancia il test e verifica che fallisca**

```bash
npm test
```

Atteso: FAIL, `Failed to resolve import "@admin/app"`.

- [ ] **Step 9: Crea `backend/resources/js/admin/app.tsx`**

```tsx
import { App as AntApp, ConfigProvider, Typography } from 'antd';
import itIT from 'antd/locale/it_IT';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/*
 * `retry: false`: un 401 o un 403 non migliorano riprovando, e il default di
 * Query e' tre tentativi - tre richieste per dire la stessa cosa, e il triplo
 * del tempo prima che la schermata lo dica.
 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
    },
});

/**
 * Il guscio: i provider e nient'altro.
 *
 * Il corpo diventa il router nel Task 4. Tenerlo separato da `main.tsx` e'
 * cio' che permette a un test di rendere l'app senza un DOM da montare.
 */
export const AdminApp = (): React.ReactElement => (
    <ConfigProvider locale={itIT}>
        <AntApp>
            <QueryClientProvider client={queryClient}>
                <Typography.Title level={3}>Gestionale KalTrack</Typography.Title>
            </QueryClientProvider>
        </AntApp>
    </ConfigProvider>
);
```

- [ ] **Step 10: Riscrivi `backend/resources/js/admin/main.tsx`**

```tsx
// Per primo, prima di qualunque import di AntD: la patch rimette in piedi i
// metodi statici di AntD 5 su React 19, che senza non montano niente.
import '@ant-design/v5-patch-for-react-19';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from '@admin/app';

const root = document.getElementById('admin-root');

if (root !== null) {
    createRoot(root).render(
        <StrictMode>
            <AdminApp />
        </StrictMode>,
    );
}
```

- [ ] **Step 11: Lancia il test e verifica che passi**

```bash
npm test
```

Atteso: PASS, 1 test.

- [ ] **Step 12: Rimetti `@viteReactRefresh` in `backend/resources/views/admin.blade.php`**

Sostituisci il commento Blade e la riga `@vite` con:

```blade
    {{--
        `@viteReactRefresh` PRIMA di `@vite`: inietta il runtime di Fast
        Refresh, che in `npm run dev` deve esistere prima che il modulo React
        venga valutato. In build di produzione e' un no-op. Fino alla Fase 2
        era assente di proposito, perche' `@vitejs/plugin-react` non era
        installato e lo script chiedeva un /@react-refresh che rispondeva 404.
    --}}
    @viteReactRefresh
    @vite(['resources/js/admin/main.tsx'])
```

- [ ] **Step 13: Fai copiare `tsconfig.json` allo stadio degli asset in `backend/Dockerfile`**

Accanto a `COPY vite.config.js ./`:

```dockerfile
COPY vite.config.js tsconfig.json ./
```

`vite build` non fa typecheck, ma esbuild legge `tsconfig.json` per `jsx` e per i `paths` dell'alias: senza il file nell'immagine, ogni import `@admin/...` non risolve e il build muore nel container e non qui.

- [ ] **Step 14: Verifica i tre cancelli**

```bash
npm run typecheck && npm test && npm run build
```

Atteso: tutti e tre verdi, e `public/build/manifest.json` nominato nell'output di Vite.

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.js vitest.config.ts vitest.setup.ts resources/js/admin resources/views/admin.blade.php Dockerfile
git commit -m "$(cat <<'EOF'
build(admin): stand up the React toolchain for the panel

The placeholder that wrote "Pannello non ancora disponibile" is replaced by a
real React 19 mount with its providers: Ant Design 5 (locale it_IT), TanStack
Query, and the React 19 compatibility patch that AntD 5 needs for its static
methods.

Three files now carry the same `@admin` alias - tsconfig, vite.config.js and
vitest.config.ts - because typecheck, build and tests each resolve imports
their own way. The Dockerfile's asset stage copies tsconfig.json for the same
reason: esbuild reads the paths from it, so without the file every `@admin/`
import would resolve here and fail inside the container.

Vitest runs from its own config rather than a `test` block in vite.config.js:
that one mounts laravel-vite-plugin, which looks for .env and the manifest,
neither of which exists during a test run. The setup file stubs matchMedia and
ResizeObserver, which jsdom lacks and AntD calls as soon as it mounts a Layout
or a Table.

`npm run build` stays `vite build` alone. The typecheck is a development gate,
not a deploy one: the Docker asset stage has no tests to compile and a type
error in one should not be able to block a release.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 2: Il client HTTP e il giro CSRF

Tutto quel che il pannello chiede passa da qui. E' la parte con piu' logica vera e meno pixel del progetto, quindi e' quella con i test piu' fitti.

**Files:**
- Create: `backend/resources/js/admin/api/csrf.ts`
- Create: `backend/resources/js/admin/api/errors.ts`
- Create: `backend/resources/js/admin/api/client.ts`
- Create: `backend/resources/js/admin/api/types.ts`
- Test: `backend/resources/js/admin/api/csrf.test.ts`
- Test: `backend/resources/js/admin/api/client.test.ts`

**Interfaces:**
- Produces:
  - `readCookie(source: string, name: string): string | null`
  - `ensureCsrfToken(): Promise<string | null>`
  - `class ApiError extends Error { readonly status: number; readonly errors: Record<string, string[]> }`
  - `toFormFields(errors: Record<string, string[]>): Array<{ name: string; errors: string[] }>`
  - `messageOf(error: unknown): string`
  - `apiFetch<T>(path: string, options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: Record<string, unknown> | FormData; signal?: AbortSignal }): Promise<T>`
  - le interfacce di risposta in `types.ts`, consumate da ogni pagina.

- [ ] **Step 1: Scrivi il test che fallisce per il cookie**

Crea `backend/resources/js/admin/api/csrf.test.ts`:

```ts
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
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- csrf
```

Atteso: FAIL, `Failed to resolve import "@admin/api/csrf"`.

- [ ] **Step 3: Crea `backend/resources/js/admin/api/csrf.ts`**

```ts
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
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- csrf
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Crea `backend/resources/js/admin/api/errors.ts`**

Non ha un test proprio: i suoi tre comportamenti si provano da `client.test.ts`, che e' l'unico posto da cui un `ApiError` nasce davvero.

```ts
/**
 * Un errore che il server ha spiegato.
 *
 * `errors` e' il corpo `errors` di Laravel - campo per campo - e `message` il
 * riassunto in una frase che `App\Support\ValidationMessage` scrive apposta
 * per un toast. Si usano tutti e due: il riassunto sopra, i dettagli sotto il
 * campo giusto.
 */
export class ApiError extends Error {
    readonly status: number;

    readonly errors: Record<string, string[]>;

    constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.errors = errors;
    }
}

export interface FieldError {
    name: string;
    errors: string[];
}

/** Il corpo `errors` nella forma che `Form.setFields` di AntD si aspetta. */
export function toFormFields(errors: Record<string, string[]>): FieldError[] {
    return Object.entries(errors).map(([name, messages]) => ({ name, errors: messages }));
}

/** Il testo da mettere in un toast, qualunque cosa sia arrivata. */
export function messageOf(error: unknown): string {
    if (error instanceof Error && error.message !== '') {
        return error.message;
    }

    return 'Errore imprevisto.';
}
```

- [ ] **Step 6: Scrivi il test che fallisce per il client**

Crea `backend/resources/js/admin/api/client.test.ts`:

```ts
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
});
```

- [ ] **Step 7: Lancia e verifica che fallisca**

```bash
npm test -- client
```

Atteso: FAIL, `Failed to resolve import "@admin/api/client"`.

- [ ] **Step 8: Crea `backend/resources/js/admin/api/client.ts`**

```ts
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
```

- [ ] **Step 9: Lancia e verifica che passi**

```bash
npm test -- client
```

Atteso: PASS, 6 test.

- [ ] **Step 10: Crea `backend/resources/js/admin/api/types.ts`**

Le forme sono copiate dai metodi `forma()` dei controller: `AdminExerciseController`, `AdminFoodController`, `TaxonomyController`, `SubmissionController`, `AdminController`.

```ts
export interface AdminMe {
    handle: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
}

export interface Stats {
    users: number;
    pending: { exercises: number; foods: number };
    published: { exercises: number; foods: number };
    missing: { instructions: number; photos: number };
}

export interface Paginato<T> {
    data: T[];
    meta: { total: number; page: number; lastPage: number };
}

export interface Elenco<T> {
    data: T[];
}

export interface ExerciseRow {
    id: number;
    uid: string;
    name: string;
    muscleGroup: string;
    secondaryMuscles: string | null;
    equipment: string | null;
    instructions: string | null;
    photo: string | null;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface FoodRow {
    id: number;
    uid: string;
    name: string;
    brand: string | null;
    barcode: string | null;
    offId: string | null;
    kcal: number;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturatedFat: number | null;
    fiber: number | null;
    salt: number | null;
    isLiquid: boolean;
    defaultServingG: number | null;
    servingLabel: string | null;
    image: string | null;
    status: string;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface TaxonomyRow {
    id: number;
    slug: string;
    labelIt: string;
    labelEn: string;
    sort: number;
}

export type TaxonomyKind = 'muscle-groups' | 'equipment';

export type SubmissionType = 'exercise' | 'food';

export interface SubmissionRow {
    id: number;
    type: SubmissionType;
    uid: string;
    name: string;
    status: string;
    reviewNote: string | null;
    createdAt: string | null;
    author: { handle: string; displayName: string } | null;
    /*
     * I campi dipendono dal tipo, e il server li manda in un oggetto a parte
     * apposta. `unknown` e non `any`: chi li legge sa gia' che tipo sta
     * guardando e li restringe li'.
     */
    fields: Record<string, unknown>;
}

export interface UserRow {
    id: number;
    handle: string;
    displayName: string;
    email: string;
    isAdmin: boolean;
    aiEnabled: boolean;
    createdAt: string | null;
    submitted: number;
    published: number;
}
```

- [ ] **Step 11: Verifica i cancelli**

```bash
npm run typecheck && npm test
```

Atteso: verdi, 10 test.

- [ ] **Step 12: Commit**

```bash
git add resources/js/admin/api
git commit -m "$(cat <<'EOF'
feat(admin): the HTTP client and the Sanctum SPA CSRF round

Everything the panel asks the server goes through `apiFetch`. It carries the
session cookie, and on anything that is not a read it adds the `X-XSRF-TOKEN`
header, fetching `/sanctum/csrf-cookie` first when the cookie is not there yet.

Three decisions worth their comments:

`readCookie` compares the whole name, not a prefix. A `startsWith` would take
`MIO-XSRF-TOKEN` for `XSRF-TOKEN` and send the wrong token, which surfaces as a
419 nobody can explain. It takes the cookie string as an argument so it can be
tested without a DOM, and it decodes the value: Laravel writes the cookie
url-encoded and expects it back decoded in the header. That change of shape is
the one step of the round people get wrong.

A 419 is retried exactly once, after refreshing the cookie. SESSION_LIFETIME is
120 minutes and the token rotates, so a tab left open since morning holds a
stale cookie and the first save after lunch would fail with nothing readable.
If the second attempt fails too it is not the token, it is the session, and the
401 that follows says so.

An unparseable body becomes an ApiError carrying the real status rather than a
JSON syntax error. A 500 renders an HTML error page, and demanding JSON from it
showed "Unexpected token <" where "the server broke" belongs.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 3: La sessione e il login

**Files:**
- Create: `backend/resources/js/admin/auth/session.ts`
- Create: `backend/resources/js/admin/auth/AuthProvider.tsx`
- Create: `backend/resources/js/admin/auth/LoginPage.tsx`
- Test: `backend/resources/js/admin/auth/session.test.ts`
- Test: `backend/resources/js/admin/auth/LoginPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `messageOf`, `toFormFields` (Task 2); `AdminMe` da `@admin/api/types`.
- Produces:
  - `fetchMe(): Promise<AdminMe | null>` - `null` quando la sessione non c'e' o non e' di un amministratore.
  - `login(credenziali: { login: string; password: string }): Promise<void>`
  - `logout(): Promise<void>`
  - `<AuthProvider>` e `useAuth(): { stato: 'attesa' | 'anonimo' | 'dentro'; me: AdminMe | null; rileggi: () => Promise<void>; esci: () => Promise<void> }`
  - `<LoginPage />`

- [ ] **Step 1: Scrivi il test che fallisce per la sessione**

Crea `backend/resources/js/admin/auth/session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, login } from '@admin/auth/session';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

describe('la sessione', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('riconosce un amministratore', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                risposta(200, {
                    handle: 'martin',
                    displayName: 'Martin',
                    email: 'm@example.com',
                    isAdmin: true,
                }),
            ),
        );

        await expect(fetchMe()).resolves.toMatchObject({ handle: 'martin', isAdmin: true });
    });

    it('torna null senza sessione, invece di lanciare', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' })));

        await expect(fetchMe()).resolves.toBeNull();
    });

    it('torna null per una sessione che non e\' di un amministratore', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                risposta(200, {
                    handle: 'tizio',
                    displayName: 'Tizio',
                    email: 't@example.com',
                    isAdmin: false,
                }),
            ),
        );

        await expect(fetchMe()).resolves.toBeNull();
    });

    it('accede su /admin/login e non su /api/login', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(200, { handle: 'martin' }));
        vi.stubGlobal('fetch', finta);

        await login({ login: 'martin', password: 'segreta' });

        expect(finta.mock.calls[0][0]).toBe('/admin/login');
    });
});
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- session
```

Atteso: FAIL, `Failed to resolve import "@admin/auth/session"`.

- [ ] **Step 3: Crea `backend/resources/js/admin/auth/session.ts`**

```ts
import { apiFetch } from '@admin/api/client';
import { ApiError } from '@admin/api/errors';
import type { AdminMe } from '@admin/api/types';

/**
 * Chi e' entrato, o `null`.
 *
 * `GET /api/me` e non una rotta nuova: e' gia' sotto `auth:sanctum`, e da
 * quando `statefulApi()` vale sulle rotte `/api/*` il cookie di sessione le
 * apre come farebbe un token. Torna `null` invece di lanciare perche' "non
 * sei entrato" non e' un guasto: e' la meta' dei casi al primo caricamento.
 *
 * Un utente valido ma non amministratore vale `null` come un anonimo.
 * `AdminAuthController::login` gia' rifiuta chi non ha `is_admin`, quindi non
 * dovrebbe capitare; se capitasse - un account degradato a sessione aperta -
 * mostrargli il pannello vorrebbe dire mostrargli sei pagine che rispondono
 * 403 una per una.
 */
export async function fetchMe(): Promise<AdminMe | null> {
    try {
        const me = await apiFetch<AdminMe>('/api/me');

        return me.isAdmin ? me : null;
    } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            return null;
        }

        throw error;
    }
}

export async function login(credenziali: { login: string; password: string }): Promise<void> {
    await apiFetch('/admin/login', { method: 'POST', body: credenziali });
}

export async function logout(): Promise<void> {
    await apiFetch('/admin/logout', { method: 'POST', body: {} });
}
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- session
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Crea `backend/resources/js/admin/auth/AuthProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMe, logout } from '@admin/auth/session';
import type { AdminMe } from '@admin/api/types';

type Stato = 'attesa' | 'anonimo' | 'dentro';

interface Sessione {
    stato: Stato;
    me: AdminMe | null;
    rileggi: () => Promise<void>;
    esci: () => Promise<void>;
}

const Contesto = createContext<Sessione | null>(null);

export const CHIAVE_ME = ['me'] as const;

export const AuthProvider = ({ children }: { children: ReactNode }): React.ReactElement => {
    const client = useQueryClient();
    const { data, isPending } = useQuery({ queryKey: CHIAVE_ME, queryFn: fetchMe });

    const rileggi = useCallback(async () => {
        await client.invalidateQueries({ queryKey: CHIAVE_ME });
    }, [client]);

    const esci = useCallback(async () => {
        await logout();
        /*
         * Tutta la cache, non solo `me`: quel che resta sono elenchi che
         * appartenevano alla sessione appena chiusa, e lasciarli farebbe
         * vedere al prossimo che entra i dati caricati dal precedente per un
         * fotogramma.
         */
        client.clear();
    }, [client]);

    const valore = useMemo<Sessione>(() => {
        const me = data ?? null;

        return {
            stato: isPending ? 'attesa' : me === null ? 'anonimo' : 'dentro',
            me,
            rileggi,
            esci,
        };
    }, [data, isPending, rileggi, esci]);

    return <Contesto.Provider value={valore}>{children}</Contesto.Provider>;
};

export const useAuth = (): Sessione => {
    const valore = useContext(Contesto);

    if (valore === null) {
        throw new Error('useAuth fuori da AuthProvider.');
    }

    return valore;
};
```

- [ ] **Step 6: Scrivi il test che fallisce per la pagina di accesso**

Crea `backend/resources/js/admin/auth/LoginPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from '@admin/auth/LoginPage';
import { AuthProvider } from '@admin/auth/AuthProvider';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

const monta = (): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <AuthProvider>
                    <LoginPage />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('LoginPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('manda handle e password a /admin/login', async () => {
        const finta = vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' }));
        vi.stubGlobal('fetch', finta);
        monta();

        await userEvent.type(screen.getByLabelText('Handle o email'), 'martin');
        await userEvent.type(screen.getByLabelText('Password'), 'segreta');
        await userEvent.click(screen.getByRole('button', { name: 'Entra' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find((c) => c[0] === '/admin/login');
            expect(chiamata).toBeDefined();
            expect(chiamata?.[1].body).toBe('{"login":"martin","password":"segreta"}');
        });
    });

    it('mostra sotto il campo l\'errore che il server manda', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) =>
                Promise.resolve(
                    url === '/admin/login'
                        ? risposta(422, {
                              message: 'Le credenziali non sono corrette.',
                              errors: { login: ['Le credenziali non sono corrette.'] },
                          })
                        : risposta(401, { message: 'Unauthenticated.' }),
                ),
            ),
        );
        monta();

        await userEvent.type(screen.getByLabelText('Handle o email'), 'martin');
        await userEvent.type(screen.getByLabelText('Password'), 'sbagliata');
        await userEvent.click(screen.getByRole('button', { name: 'Entra' }));

        expect(await screen.findByText('Le credenziali non sono corrette.')).toBeDefined();
    });
});
```

- [ ] **Step 7: Lancia e verifica che fallisca**

```bash
npm test -- LoginPage
```

Atteso: FAIL, `Failed to resolve import "@admin/auth/LoginPage"`.

- [ ] **Step 8: Crea `backend/resources/js/admin/auth/LoginPage.tsx`**

```tsx
import { useState } from 'react';
import { App, Button, Card, Form, Input, Typography } from 'antd';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import { login } from '@admin/auth/session';
import { useAuth } from '@admin/auth/AuthProvider';

interface Credenziali {
    login: string;
    password: string;
}

/**
 * L'unica pagina che esiste per chi non e' entrato.
 *
 * Non c'e' una registrazione e non c'e' un recupero password: gli account li
 * fa l'app, e la password la rimette un amministratore da Utenti. Dirlo qui
 * evita la domanda.
 */
export const LoginPage = (): React.ReactElement => {
    const [form] = Form.useForm<Credenziali>();
    const [inCorso, setInCorso] = useState(false);
    const { rileggi } = useAuth();
    const { message } = App.useApp();

    const entra = async (valori: Credenziali): Promise<void> => {
        setInCorso(true);

        try {
            await login(valori);
            await rileggi();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
            }}
        >
            <Card style={{ width: 380 }}>
                <Typography.Title level={4}>Gestionale KalTrack</Typography.Title>
                <Typography.Paragraph type="secondary">
                    L&apos;accesso e&apos; riservato agli amministratori.
                </Typography.Paragraph>
                <Form form={form} layout="vertical" onFinish={entra} requiredMark={false}>
                    <Form.Item
                        name="login"
                        label="Handle o email"
                        rules={[{ required: true, message: 'Serve un handle o un\'email.' }]}
                    >
                        <Input autoComplete="username" autoFocus />
                    </Form.Item>
                    <Form.Item
                        name="password"
                        label="Password"
                        rules={[{ required: true, message: 'Serve la password.' }]}
                    >
                        <Input.Password autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={inCorso}>
                        Entra
                    </Button>
                </Form>
            </Card>
        </div>
    );
};
```

- [ ] **Step 9: Lancia e verifica che passi**

```bash
npm test -- LoginPage
```

Atteso: PASS, 2 test.

- [ ] **Step 10: Verifica i cancelli**

```bash
npm run typecheck && npm test
```

Atteso: verdi, 16 test.

- [ ] **Step 11: Commit**

```bash
git add resources/js/admin/auth
git commit -m "$(cat <<'EOF'
feat(admin): session probe and the login page

`fetchMe` asks `GET /api/me` rather than a new route: it already sits behind
auth:sanctum, and since `statefulApi()` covers `/api/*` the session cookie
opens it exactly as a token would. It returns null instead of throwing, because
"not signed in" is not a fault - it is half the cases on first load.

A valid but non-admin session counts as null too. AdminAuthController::login
already refuses anyone without is_admin so it should not happen; if it did - an
account demoted while its session was open - showing them the panel would mean
showing six pages that each answer 403 on their own.

Signing out clears the whole query cache, not just `me`. What is left are lists
belonging to the session that just closed, and keeping them would show the next
person to sign in the previous one's data for a frame.

The login form puts the server's per-field messages under the fields and its
summary in a toast. That is what the spec asks for here and it is the opposite
of the app's rule in CLAUDE.md, which is about DfForm on the phone.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 4: Il guscio e le sei strade

Il router, la barra laterale, e sei pagine vuote che diventano vere nei task successivi. Le pagine nascono qui perche' una rotta che punta a niente non e' una rotta: senza, ogni task dovrebbe rimettere mano al router.

**Files:**
- Create: `backend/resources/js/admin/layout/AdminLayout.tsx`
- Create: `backend/resources/js/admin/layout/Protected.tsx`
- Create: `backend/resources/js/admin/layout/PageHeader.tsx`
- Create: `backend/resources/js/admin/router.tsx`
- Create: `backend/resources/js/admin/pages/DashboardPage.tsx`
- Create: `backend/resources/js/admin/pages/SubmissionsPage.tsx`
- Create: `backend/resources/js/admin/pages/ExercisesPage.tsx`
- Create: `backend/resources/js/admin/pages/FoodsPage.tsx`
- Create: `backend/resources/js/admin/pages/TaxonomiesPage.tsx`
- Create: `backend/resources/js/admin/pages/UsersPage.tsx`
- Modify: `backend/resources/js/admin/app.tsx`
- Test: `backend/resources/js/admin/router.test.tsx`
- Modify: `backend/resources/js/admin/app.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth`, `LoginPage` (Task 3).
- Produces:
  - `router` da `@admin/router`, con `basename: '/admin'` e le rotte `/` (Dashboard), `/proposte`, `/esercizi`, `/alimenti`, `/tassonomie`, `/utenti`, `/login`.
  - `<PageHeader titolo azione?>` - il titolo di pagina, usato da tutte e sei.
  - Le sei pagine, ognuna esportata col suo nome (`DashboardPage`, `SubmissionsPage`, `ExercisesPage`, `FoodsPage`, `TaxonomiesPage`, `UsersPage`).

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/router.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { rotte } from '@admin/router';

const risposta = (status: number, corpo: unknown): Response =>
    new Response(JSON.stringify(corpo), { status });

const monta = (percorso: string): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <AuthProvider>
                    <RouterProvider router={createMemoryRouter(rotte, { initialEntries: [percorso] })} />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('il router', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('manda al login chi non e\' entrato', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(risposta(401, { message: 'Unauthenticated.' })));
        monta('/esercizi');

        expect(await screen.findByRole('button', { name: 'Entra' })).toBeDefined();
    });

    it('disegna la pagina chiesta a chi e\' entrato', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string) =>
                Promise.resolve(
                    url === '/api/me'
                        ? risposta(200, {
                              handle: 'martin',
                              displayName: 'Martin',
                              email: 'm@example.com',
                              isAdmin: true,
                          })
                        : risposta(200, { data: [], meta: { total: 0, page: 1, lastPage: 1 } }),
                ),
            ),
        );
        monta('/tassonomie');

        expect(await screen.findByRole('heading', { name: 'Tassonomie' })).toBeDefined();
    });
});
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- router
```

Atteso: FAIL, `Failed to resolve import "@admin/router"`.

- [ ] **Step 3: Crea `backend/resources/js/admin/layout/PageHeader.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Flex, Typography } from 'antd';

interface Props {
    titolo: string;
    sottotitolo?: string;
    azione?: ReactNode;
}

/**
 * Il titolo di una pagina, con la sua azione a destra.
 *
 * Scritto una volta: sei pagine che se lo ridisegnano si somigliano per copia
 * e divergono alla prima correzione fatta in una sola.
 */
export const PageHeader = ({ titolo, sottotitolo, azione }: Props): React.ReactElement => (
    <Flex justify="space-between" align="flex-start" style={{ marginBottom: 16 }} gap={16}>
        <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
                {titolo}
            </Typography.Title>
            {sottotitolo !== undefined && (
                <Typography.Text type="secondary">{sottotitolo}</Typography.Text>
            )}
        </div>
        {azione}
    </Flex>
);
```

- [ ] **Step 4: Crea `backend/resources/js/admin/layout/AdminLayout.tsx`**

```tsx
import {
    AppstoreOutlined,
    DashboardOutlined,
    InboxOutlined,
    LogoutOutlined,
    TagsOutlined,
    ThunderboltOutlined,
    TeamOutlined,
} from '@ant-design/icons';
import { Button, Flex, Layout, Menu, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@admin/auth/AuthProvider';

const VOCI = [
    { key: '/', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/proposte', icon: <InboxOutlined />, label: 'Proposte' },
    { key: '/esercizi', icon: <ThunderboltOutlined />, label: 'Esercizi' },
    { key: '/alimenti', icon: <AppstoreOutlined />, label: 'Alimenti' },
    { key: '/tassonomie', icon: <TagsOutlined />, label: 'Tassonomie' },
    { key: '/utenti', icon: <TeamOutlined />, label: 'Utenti' },
];

export const AdminLayout = (): React.ReactElement => {
    const naviga = useNavigate();
    const { pathname } = useLocation();
    const { me, esci } = useAuth();

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider breakpoint="lg" collapsedWidth={64} theme="light">
                <Typography.Text strong style={{ display: 'block', padding: 16 }}>
                    KalTrack
                </Typography.Text>
                <Menu
                    mode="inline"
                    // Il percorso e' la chiave: senza `selectedKeys` la voce
                    // accesa sarebbe quella cliccata, e arrivando da un link
                    // diretto o da un ricaricamento non sarebbe accesa
                    // nessuna.
                    selectedKeys={[pathname]}
                    items={VOCI}
                    onClick={({ key }) => naviga(key)}
                />
            </Layout.Sider>
            <Layout>
                <Layout.Header style={{ background: '#fff', paddingInline: 24 }}>
                    <Flex justify="flex-end" align="center" gap={12}>
                        <Typography.Text type="secondary">{me?.displayName}</Typography.Text>
                        <Button icon={<LogoutOutlined />} onClick={() => void esci()}>
                            Esci
                        </Button>
                    </Flex>
                </Layout.Header>
                <Layout.Content style={{ padding: 24 }}>
                    <Outlet />
                </Layout.Content>
            </Layout>
        </Layout>
    );
};
```

- [ ] **Step 5: Crea `backend/resources/js/admin/layout/Protected.tsx`**

```tsx
import { Flex, Spin } from 'antd';
import { Navigate, useLocation } from 'react-router-dom';
import { AdminLayout } from '@admin/layout/AdminLayout';
import { useAuth } from '@admin/auth/AuthProvider';

/**
 * Il guscio, ma solo per chi e' entrato.
 *
 * Lo stato `attesa` ha una schermata sua e non cade nel ramo dell'anonimo:
 * finche' `GET /api/me` non ha risposto non si sa niente, e rimandare al login
 * chi e' gia' dentro gli farebbe vedere un modulo di accesso lampeggiare a
 * ogni ricaricamento.
 */
export const Protected = (): React.ReactElement => {
    const { stato } = useAuth();
    const { pathname } = useLocation();

    if (stato === 'attesa') {
        return (
            <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (stato === 'anonimo') {
        return <Navigate to="/login" replace state={{ da: pathname }} />;
    }

    return <AdminLayout />;
};
```

- [ ] **Step 6: Crea le sei pagine come guscio**

Ognuna e' un file con lo stesso schema. Crea tutti e sei:

`backend/resources/js/admin/pages/DashboardPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const DashboardPage = (): React.ReactElement => <PageHeader titolo="Dashboard" />;
```

`backend/resources/js/admin/pages/SubmissionsPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const SubmissionsPage = (): React.ReactElement => <PageHeader titolo="Proposte" />;
```

`backend/resources/js/admin/pages/ExercisesPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const ExercisesPage = (): React.ReactElement => <PageHeader titolo="Esercizi" />;
```

`backend/resources/js/admin/pages/FoodsPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const FoodsPage = (): React.ReactElement => <PageHeader titolo="Alimenti" />;
```

`backend/resources/js/admin/pages/TaxonomiesPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const TaxonomiesPage = (): React.ReactElement => <PageHeader titolo="Tassonomie" />;
```

`backend/resources/js/admin/pages/UsersPage.tsx`:

```tsx
import { PageHeader } from '@admin/layout/PageHeader';

export const UsersPage = (): React.ReactElement => <PageHeader titolo="Utenti" />;
```

- [ ] **Step 7: Crea `backend/resources/js/admin/router.tsx`**

```tsx
import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { LoginPage } from '@admin/auth/LoginPage';
import { Protected } from '@admin/layout/Protected';
import { DashboardPage } from '@admin/pages/DashboardPage';
import { SubmissionsPage } from '@admin/pages/SubmissionsPage';
import { ExercisesPage } from '@admin/pages/ExercisesPage';
import { FoodsPage } from '@admin/pages/FoodsPage';
import { TaxonomiesPage } from '@admin/pages/TaxonomiesPage';
import { UsersPage } from '@admin/pages/UsersPage';

/*
 * Le rotte separate dal router: `createMemoryRouter` le riusa nei test, dove
 * un `createBrowserRouter` leggerebbe la barra degli indirizzi di jsdom.
 */
export const rotte: RouteObject[] = [
    { path: '/login', element: <LoginPage /> },
    {
        path: '/',
        element: <Protected />,
        children: [
            { index: true, element: <DashboardPage /> },
            { path: 'proposte', element: <SubmissionsPage /> },
            { path: 'esercizi', element: <ExercisesPage /> },
            { path: 'alimenti', element: <FoodsPage /> },
            { path: 'tassonomie', element: <TaxonomiesPage /> },
            { path: 'utenti', element: <UsersPage /> },
        ],
    },
];

/*
 * `basename: '/admin'`: la SPA vive sotto quel prefisso e il catch-all
 * `GET /admin/{any?}` rende la stessa vista per ogni percorso. Senza, ogni
 * link punterebbe alla radice del sito.
 */
export const router = createBrowserRouter(rotte, { basename: '/admin' });
```

- [ ] **Step 8: Monta il router in `backend/resources/js/admin/app.tsx`**

Sostituisci il `Typography.Title` con il router e l'`AuthProvider`. Il file diventa:

```tsx
import { App as AntApp, ConfigProvider } from 'antd';
import itIT from 'antd/locale/it_IT';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@admin/auth/AuthProvider';
import { router } from '@admin/router';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
    },
});

/**
 * Il guscio: i provider, e l'ordine conta.
 *
 * `AuthProvider` sta DENTRO `QueryClientProvider` perche' la sessione la legge
 * con una query come tutto il resto, e SOPRA il router perche' la guardia
 * delle rotte la interroga.
 */
export const AdminApp = (): React.ReactElement => (
    <ConfigProvider locale={itIT}>
        <AntApp>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <RouterProvider router={router} />
                </AuthProvider>
            </QueryClientProvider>
        </AntApp>
    </ConfigProvider>
);
```

- [ ] **Step 9: Aggiorna `backend/resources/js/admin/app.test.tsx`**

Il test del Task 1 cercava un titolo che non c'e' piu'. Sostituiscilo per intero:

```tsx
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
```

- [ ] **Step 10: Lancia e verifica che passi**

```bash
npm test
```

Atteso: PASS, 19 test.

- [ ] **Step 11: Verifica i cancelli**

```bash
npm run typecheck && npm test && npm run build
```

- [ ] **Step 12: Commit**

```bash
git add resources/js/admin
git commit -m "$(cat <<'EOF'
feat(admin): the shell, the router and six empty pages

React Router with basename '/admin', which is what the `GET /admin/{any?}`
catch-all was built for: every path renders the same view and the router picks
the page. The routes live in their own export so `createMemoryRouter` can reuse
them in tests, where a browser router would read jsdom's address bar.

`Protected` gives the pending state a screen of its own rather than letting it
fall into the anonymous branch. Until `GET /api/me` has answered nothing is
known, and redirecting someone who is already signed in would flash a login
form on every reload.

The sidebar's selected key is the pathname, not the last click. Without that,
arriving from a direct link or a reload would light up no entry at all.

The six pages are created empty here on purpose: a route pointing at nothing is
not a route, and adding them one per task would mean reopening the router six
times.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 5: La dashboard

**Files:**
- Modify: `backend/resources/js/admin/pages/DashboardPage.tsx`
- Test: `backend/resources/js/admin/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `Stats`, `PageHeader`.
- Produces: niente per gli altri task. E' l'unica pagina che legge e basta.

I due numeri sotto `missing` non sono decorazione: 128 esercizi su 200 sono rimasti senza descrizione per mesi perche' nessuna schermata contava quanti fossero. Il numero e il link che ci porta dentro (`/esercizi?missing=instructions`) sono le due meta' dello stesso rimedio, e il link va scritto **ora**, anche se la pagina Esercizi lo leggera' solo nel Task 7.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/pages/DashboardPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { DashboardPage } from '@admin/pages/DashboardPage';

const STATS = {
    users: 7,
    pending: { exercises: 3, foods: 2 },
    published: { exercises: 200, foods: 193 },
    missing: { instructions: 128, photos: 200 },
};

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(STATS), { status: 200 })),
        );
    });

    it('mostra le proposte in attesa sommando i due tipi', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <AntApp>
                <QueryClientProvider client={client}>
                    <RouterProvider
                        router={createMemoryRouter([{ path: '/', element: <DashboardPage /> }])}
                    />
                </QueryClientProvider>
            </AntApp>,
        );

        expect(await screen.findByText('Proposte in attesa')).toBeDefined();
        expect(screen.getByText('5')).toBeDefined();
        expect(screen.getByText('128')).toBeDefined();
    });
});
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- DashboardPage
```

Atteso: FAIL, `Unable to find an element with the text: Proposte in attesa`.

- [ ] **Step 3: Riscrivi `backend/resources/js/admin/pages/DashboardPage.tsx`**

```tsx
import { Alert, Card, Col, Row, Skeleton, Statistic, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import type { Stats } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';

export const DashboardPage = (): React.ReactElement => {
    const { data, isPending, error } = useQuery({
        queryKey: ['stats'],
        queryFn: () => apiFetch<Stats>('/api/admin/stats'),
    });

    if (error !== null) {
        return (
            <>
                <PageHeader titolo="Dashboard" />
                <Alert type="error" showIcon message={messageOf(error)} />
            </>
        );
    }

    if (isPending) {
        return (
            <>
                <PageHeader titolo="Dashboard" />
                <Skeleton active />
            </>
        );
    }

    return (
        <>
            <PageHeader titolo="Dashboard" />
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Proposte in attesa"
                            value={data.pending.exercises + data.pending.foods}
                        />
                        <Link to="/proposte">Vai alla coda</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Iscritti" value={data.users} />
                        <Link to="/utenti">Vedi gli utenti</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Esercizi pubblicati" value={data.published.exercises} />
                        <Link to="/esercizi">Apri il catalogo</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Alimenti pubblicati" value={data.published.foods} />
                        <Link to="/alimenti">Apri il catalogo</Link>
                    </Card>
                </Col>
            </Row>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
                Cosa manca
            </Typography.Title>
            <Typography.Paragraph type="secondary">
                Conta solo gli esercizi <strong>pubblicati</strong>: una proposta ancora in coda non
                e&apos; un buco nel catalogo, e&apos; una riga da revisionare.
            </Typography.Paragraph>
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12}>
                    <Card>
                        <Statistic title="Esercizi senza descrizione" value={data.missing.instructions} />
                        {/*
                            Il numero e il filtro che ci porta dentro sono le
                            due meta' dello stesso rimedio: sapere che 128
                            esercizi sono muti non serve a niente se poi non
                            si sa quali.
                        */}
                        <Link to="/esercizi?missing=instructions">Vedi quali</Link>
                    </Card>
                </Col>
                <Col xs={24} sm={12}>
                    <Card>
                        <Statistic title="Esercizi senza foto" value={data.missing.photos} />
                        <Link to="/esercizi?missing=photo">Vedi quali</Link>
                    </Card>
                </Col>
            </Row>
        </>
    );
};
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- DashboardPage
```

Atteso: PASS, 1 test.

- [ ] **Step 5: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test
git add resources/js/admin/pages/DashboardPage.tsx resources/js/admin/pages/DashboardPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): the dashboard

Six numbers from `GET /api/admin/stats`, and the two under `missing` are the
point of the page. 128 of 200 exercises sat without instructions for months
because no screen counted them; the count and the filter that walks into it
(`/esercizi?missing=instructions`) are two halves of the same fix, so the links
are written now even though the Exercises page reads the query string later.

The page states why those two count published rows only: a submission still in
the queue is not a hole in the catalogue, it is a row waiting for review, and
ExerciseController::store collects neither instructions nor photo, so every
pending row would be mute by construction and inflate the number.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 6: Le tassonomie

Prima degli esercizi perche' li descrive: la pagina Esercizi legge gli stessi due elenchi per riempire le sue tendine, e l'hook nasce qui.

**Files:**
- Create: `backend/resources/js/admin/api/taxonomies.ts`
- Modify: `backend/resources/js/admin/pages/TaxonomiesPage.tsx`
- Create: `backend/resources/js/admin/pages/TaxonomyForm.tsx`
- Test: `backend/resources/js/admin/pages/TaxonomiesPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `TaxonomyRow`, `TaxonomyKind`, `PageHeader`.
- Produces:
  - `useTaxonomy(kind: TaxonomyKind)` - la query, chiave `['taxonomies', kind]`.
  - `opzioniTassonomia(righe: TaxonomyRow[] | undefined): Array<{ value: string; label: string }>` - le opzioni per un `Select`, etichetta italiana e valore slug. **La usa il Task 7.**
  - `<TaxonomyForm kind riga onChiudi />`

- [ ] **Step 1: Crea `backend/resources/js/admin/api/taxonomies.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import type { Elenco, TaxonomyKind, TaxonomyRow } from '@admin/api/types';

export const chiaveTassonomia = (kind: TaxonomyKind): [string, TaxonomyKind] => ['taxonomies', kind];

export function useTaxonomy(kind: TaxonomyKind): UseQueryResult<TaxonomyRow[]> {
    return useQuery({
        queryKey: chiaveTassonomia(kind),
        queryFn: () =>
            apiFetch<Elenco<TaxonomyRow>>(`/api/admin/taxonomies/${kind}`).then((r) => r.data),
        /*
         * Cinque minuti: sono dodici gruppi e undici attrezzi che cambiano
         * una volta all'anno, e ogni tendina della pagina Esercizi li chiede.
         * Rileggerli a ogni montaggio sarebbe una richiesta per apertura di
         * form.
         */
        staleTime: 5 * 60 * 1000,
    });
}

/** Le opzioni per un `Select`: valore lo slug, etichetta quella italiana. */
export function opzioniTassonomia(
    righe: TaxonomyRow[] | undefined,
): Array<{ value: string; label: string }> {
    return (righe ?? []).map((r) => ({ value: r.slug, label: r.labelIt }));
}
```

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/pages/TaxonomiesPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TaxonomiesPage } from '@admin/pages/TaxonomiesPage';

const GRUPPI = {
    data: [
        { id: 1, slug: 'petto', labelIt: 'Petto', labelEn: 'Chest', sort: 10 },
        { id: 2, slug: 'dorso', labelIt: 'Dorso', labelEn: 'Back', sort: 20 },
    ],
};

const monta = (): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <TaxonomiesPage />
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('TaxonomiesPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca i gruppi muscolari', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(GRUPPI), { status: 200 })),
        );
        monta();

        expect(await screen.findByText('Petto')).toBeDefined();
        expect(screen.getByText('dorso')).toBeDefined();
    });

    it('in correzione lo slug non si tocca', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify(GRUPPI), { status: 200 })),
        );
        monta();

        await userEvent.click((await screen.findAllByRole('button', { name: 'Correggi' }))[0]);

        await waitFor(() => {
            expect(screen.getByLabelText('Identificativo').hasAttribute('disabled')).toBe(true);
        });
    });

    it('mostra il motivo quando il server rifiuta la cancellazione', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((url: string, init?: { method?: string }) =>
                Promise.resolve(
                    init?.method === 'DELETE'
                        ? new Response(
                              JSON.stringify({ message: 'Ci sono ancora 12 voci che usano questo identificativo.' }),
                              { status: 422 },
                          )
                        : new Response(JSON.stringify(GRUPPI), { status: 200 }),
                ),
            ),
        );
        monta();

        await userEvent.click((await screen.findAllByRole('button', { name: 'Elimina' }))[0]);
        await userEvent.click(await screen.findByRole('button', { name: 'Elimina' }));

        expect(
            await screen.findByText('Ci sono ancora 12 voci che usano questo identificativo.'),
        ).toBeDefined();
    });
});
```

- [ ] **Step 3: Lancia e verifica che fallisca**

```bash
npm test -- TaxonomiesPage
```

Atteso: FAIL, `Unable to find an element with the text: Petto`.

- [ ] **Step 4: Crea `backend/resources/js/admin/pages/TaxonomyForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { App, Form, Input, InputNumber, Modal } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import { chiaveTassonomia } from '@admin/api/taxonomies';
import type { TaxonomyKind, TaxonomyRow } from '@admin/api/types';

interface Props {
    kind: TaxonomyKind;
    riga: TaxonomyRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    slug: string;
    labelIt: string;
    labelEn: string;
    sort: number;
}

export const TaxonomyForm = ({ kind, riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const client = useQueryClient();
    const { message } = App.useApp();

    /*
     * Il modulo si riempie dalla riga e si svuota alla chiusura: riaprendolo
     * su "Nuovo" dopo una correzione mostrerebbe altrimenti i valori di
     * quella. E' la stessa regola dei fogli dell'app.
     */
    useEffect(() => {
        if (!aperto) {
            return;
        }

        if (riga === null) {
            form.resetFields();
        } else {
            form.setFieldsValue({
                slug: riga.slug,
                labelIt: riga.labelIt,
                labelEn: riga.labelEn,
                sort: riga.sort,
            });
        }
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        setInCorso(true);

        try {
            if (riga === null) {
                await apiFetch(`/api/admin/taxonomies/${kind}`, { method: 'POST', body: { ...valori } });
            } else {
                /*
                 * Lo slug non entra nella PATCH, e il server lo ignorerebbe
                 * comunque: e' quel che sta scritto in colonna su ogni
                 * esercizio che nomina questa voce, e riscriverlo li
                 * lascerebbe orfani tutti in una volta, qui e su ogni
                 * telefono.
                 */
                await apiFetch(`/api/admin/taxonomies/${kind}/${riga.id}`, {
                    method: 'PATCH',
                    body: { labelIt: valori.labelIt, labelEn: valori.labelEn, sort: valori.sort },
                });
            }

            await client.invalidateQueries({ queryKey: chiaveTassonomia(kind) });
            message.success('Salvato.');
            onChiudi();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Modal
            open={aperto}
            title={riga === null ? 'Nuova voce' : riga.labelIt}
            okText="Salva"
            cancelText="Annulla"
            confirmLoading={inCorso}
            onOk={() => void form.submit()}
            onCancel={onChiudi}
            destroyOnHidden
        >
            <Form form={form} layout="vertical" onFinish={salva} initialValues={{ sort: 0 }}>
                <Form.Item
                    name="slug"
                    label="Identificativo"
                    rules={[{ required: true, message: 'Serve un identificativo.' }]}
                    extra={
                        riga === null
                            ? 'Non si potra\' piu\' cambiare: e\' quel che sta scritto su ogni esercizio che lo nomina.'
                            : 'Non si cambia. Rinominare la voce cambia le etichette, non l\'identificativo.'
                    }
                >
                    <Input disabled={riga !== null} />
                </Form.Item>
                <Form.Item
                    name="labelIt"
                    label="Etichetta italiana"
                    rules={[{ required: true, message: 'Serve l\'etichetta italiana.' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="labelEn"
                    label="Etichetta inglese"
                    rules={[{ required: true, message: 'Serve l\'etichetta inglese.' }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item name="sort" label="Ordine">
                    <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                </Form.Item>
            </Form>
        </Modal>
    );
};
```

- [ ] **Step 5: Riscrivi `backend/resources/js/admin/pages/TaxonomiesPage.tsx`**

```tsx
import { useState } from 'react';
import { App, Button, Modal, Space, Table, Tabs, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { chiaveTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { TaxonomyKind, TaxonomyRow } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';
import { TaxonomyForm } from '@admin/pages/TaxonomyForm';

const Elenco = ({ kind }: { kind: TaxonomyKind }): React.ReactElement => {
    const { data, isPending } = useTaxonomy(kind);
    const [inModifica, setInModifica] = useState<TaxonomyRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const client = useQueryClient();
    const { message, modal } = App.useApp();

    const elimina = (riga: TaxonomyRow): void => {
        modal.confirm({
            title: `Togliere "${riga.labelIt}"?`,
            content:
                'Il server rifiuta se ci sono ancora esercizi che la nominano, e non si puo\' togliere il corpo libero.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/taxonomies/${kind}/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: chiaveTassonomia(kind) });
                    message.success('Tolta.');
                } catch (error) {
                    message.error(messageOf(error));
                    // Rilanciato: AntD tiene aperta la finestra, e il
                    // messaggio si legge accanto a cio' che lo ha provocato.
                    throw error;
                }
            },
        });
    };

    return (
        <>
            <Space style={{ marginBottom: 16 }}>
                <Button
                    type="primary"
                    onClick={() => {
                        setInModifica(null);
                        setAperto(true);
                    }}
                >
                    Nuova voce
                </Button>
            </Space>
            <Table<TaxonomyRow>
                rowKey="id"
                loading={isPending}
                dataSource={data ?? []}
                pagination={false}
                columns={[
                    { title: 'Identificativo', dataIndex: 'slug' },
                    { title: 'Italiano', dataIndex: 'labelIt' },
                    { title: 'Inglese', dataIndex: 'labelEn' },
                    { title: 'Ordine', dataIndex: 'sort', width: 100 },
                    {
                        title: '',
                        key: 'azioni',
                        width: 190,
                        render: (_, riga) => (
                            <Space>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setInModifica(riga);
                                        setAperto(true);
                                    }}
                                >
                                    Correggi
                                </Button>
                                <Button size="small" danger onClick={() => elimina(riga)}>
                                    Elimina
                                </Button>
                            </Space>
                        ),
                    },
                ]}
            />
            <TaxonomyForm
                kind={kind}
                riga={inModifica}
                aperto={aperto}
                onChiudi={() => setAperto(false)}
            />
        </>
    );
};

export const TaxonomiesPage = (): React.ReactElement => (
    <>
        <PageHeader
            titolo="Tassonomie"
            sottotitolo="I gruppi muscolari e gli attrezzi che descrivono il catalogo."
        />
        <Typography.Paragraph type="secondary">
            L&apos;identificativo e&apos; quel che sta scritto in colonna su ogni esercizio, e non si
            cambia mai: rinominare &quot;Femorali&quot; in &quot;Ischiocrurali&quot; cambia
            l&apos;etichetta.
        </Typography.Paragraph>
        <Tabs
            items={[
                { key: 'muscle-groups', label: 'Gruppi muscolari', children: <Elenco kind="muscle-groups" /> },
                { key: 'equipment', label: 'Attrezzatura', children: <Elenco kind="equipment" /> },
            ]}
        />
    </>
);
```

Nota per `Modal`: `modal.confirm` di `App.useApp()` va usato al posto di `Modal.confirm` statico, o il tema del `ConfigProvider` non lo raggiunge. L'import di `Modal` serve solo per il tipo, quindi va **tolto** se non usato: verifica che `noUnusedLocals` non protesti e rimuovilo se serve.

- [ ] **Step 6: Lancia e verifica che passi**

```bash
npm test -- TaxonomiesPage
```

Atteso: PASS, 3 test.

- [ ] **Step 7: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test
git add resources/js/admin/api/taxonomies.ts resources/js/admin/pages/TaxonomiesPage.tsx resources/js/admin/pages/TaxonomyForm.tsx resources/js/admin/pages/TaxonomiesPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): the taxonomies page

Two tabs over one component: muscle groups and equipment are the same four
columns behind two names, and two twin pages would drift at the first fix made
in only one of them. TaxonomyController on the server made the same call.

The slug is disabled on edit and the PATCH does not carry it. The server
ignores it either way, but showing an editable field for something that cannot
change is a promise the page cannot keep: the slug is what every exercise
writes in its column, and rewriting it would orphan all of them at once, here
and on every phone. The field explains that instead of hiding it.

Deleting shows the server's reason rather than a generic failure - "12 rows
still use this" and "corpo_libero cannot be removed" are the two answers worth
reading - and the confirm dialog stays open so the message sits next to what
caused it.

useTaxonomy holds its data for five minutes: twelve groups and eleven pieces of
equipment change once a year, and every select on the Exercises page asks for
them.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 7: Gli esercizi

La pagina piu' larga: tabella con quattro filtri, form completo, e l'upload della foto - l'unica cosa in tutto il pannello che non manda JSON.

**Files:**
- Create: `backend/resources/js/admin/domain/csv.ts`
- Test: `backend/resources/js/admin/domain/csv.test.ts`
- Create: `backend/resources/js/admin/components/PhotoUpload.tsx`
- Create: `backend/resources/js/admin/components/CatalogImage.tsx`
- Create: `backend/resources/js/admin/pages/ExerciseForm.tsx`
- Modify: `backend/resources/js/admin/pages/ExercisesPage.tsx`
- Test: `backend/resources/js/admin/pages/ExercisesPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `useTaxonomy`, `opzioniTassonomia`, `ExerciseRow`, `Paginato`, `PageHeader`.
- Produces:
  - `splitCsv(value: string | null): string[]` e `joinCsv(values: string[] | undefined): string | null`
  - `<CatalogImage nome altezza? />` - la miniatura di una foto di catalogo. **La usa anche il Task 8.**
  - `<PhotoUpload endpoint campo onCaricata />` - `campo` e' `'photo'` o `'image'`, cioe' la chiave della risposta. **Lo usa anche il Task 8.**
  - `<ExerciseForm riga aperto onChiudi />`

- [ ] **Step 1: Scrivi il test che fallisce per gli elenchi in colonna**

Crea `backend/resources/js/admin/domain/csv.test.ts`:

```ts
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
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- csv
```

Atteso: FAIL, `Failed to resolve import "@admin/domain/csv"`.

- [ ] **Step 3: Crea `backend/resources/js/admin/domain/csv.ts`**

```ts
/**
 * `equipment` e `secondary_muscles` sono elenchi separati da virgola dentro
 * una stringa, non tabelle figlie: il server li filtra con un LIKE su
 * `',' || colonna || ','`. Il form li mostra come tendine a scelta multipla,
 * e la conversione avviene qui, ai due bordi, mai a mano in una schermata.
 */
export function splitCsv(value: string | null): string[] {
    if (value === null) {
        return [];
    }

    return value
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v !== '');
}

/**
 * Un elenco vuoto vale `null` e non stringa vuota: la colonna e' nullable, e
 * il filtro del server (`',' || equipment || ','`) su una stringa vuota
 * darebbe `,,` - una riga senza attrezzi che combacia con la ricerca di un
 * attrezzo il cui slug e' vuoto. Con NULL non combacia con niente, che e'
 * quel che significa.
 */
export function joinCsv(values: string[] | undefined): string | null {
    const puliti = (values ?? []).map((v) => v.trim()).filter((v) => v !== '');

    return puliti.length === 0 ? null : puliti.join(',');
}
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- csv
```

Atteso: PASS, 4 test.

- [ ] **Step 5: Crea `backend/resources/js/admin/components/CatalogImage.tsx`**

```tsx
import { PictureOutlined } from '@ant-design/icons';
import { Image } from 'antd';

interface Props {
    nome: string | null;
    lato?: number;
}

/**
 * La foto di una voce di catalogo.
 *
 * I byte stanno fuori da `public/` e li serve `GET /api/catalog/images/{name}`,
 * che e' sotto `auth:sanctum`: funziona da un `<img>` perche' il browser manda
 * il cookie di sessione anche sulle richieste di risorse, essendo lo stesso
 * host. Niente token, niente URL firmate.
 *
 * Senza foto un riquadro con l'icona e non uno spazio vuoto: lo spazio vuoto
 * sembra un difetto di caricamento, l'icona dice che la foto non c'e'.
 */
export const CatalogImage = ({ nome, lato = 48 }: Props): React.ReactElement =>
    nome === null ? (
        <div
            style={{
                width: lato,
                height: lato,
                borderRadius: 6,
                background: '#f5f5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfbfbf',
            }}
        >
            <PictureOutlined />
        </div>
    ) : (
        <Image
            src={`/api/catalog/images/${nome}`}
            width={lato}
            height={lato}
            style={{ objectFit: 'cover', borderRadius: 6 }}
            alt=""
        />
    );
```

- [ ] **Step 6: Crea `backend/resources/js/admin/components/PhotoUpload.tsx`**

```tsx
import { useState } from 'react';
import { UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';

interface Props {
    /** La rotta a cui mandare il file, gia' completa dell'id. */
    endpoint: string;
    /** La chiave della risposta: `photo` per gli esercizi, `image` per gli alimenti. */
    campo: 'photo' | 'image';
    onCaricata: (nome: string) => void;
}

/** Quel che il server accetta: `CatalogPhoto::MIMES` e `MAX_KB`. */
const ACCETTATI = '.jpg,.jpeg,.png,.webp';
const MAX_BYTE = 5120 * 1024;

/**
 * L'unica richiesta del pannello che non manda JSON.
 *
 * `customRequest` invece dell'upload di serie di AntD: quello fa un `fetch`
 * suo, senza il cookie e senza il token CSRF, e ogni caricamento tornerebbe
 * 419. Passando da `apiFetch` il giro e' quello di tutti gli altri.
 *
 * La foto si carica solo su una voce che ESISTE: la rotta e'
 * `POST .../{id}/photo`, quindi in creazione il riquadro non c'e' e compare
 * appena la voce e' salvata.
 */
export const PhotoUpload = ({ endpoint, campo, onCaricata }: Props): React.ReactElement => {
    const [inCorso, setInCorso] = useState(false);
    const { message } = App.useApp();

    const carica: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
        if (!(file instanceof File)) {
            return;
        }

        if (file.size > MAX_BYTE) {
            message.error('La foto supera i 5 MB che il server accetta.');
            onError?.(new Error('troppo grande'));

            return;
        }

        const corpo = new FormData();
        corpo.append('file', file);
        setInCorso(true);

        try {
            const risposta = await apiFetch<Record<string, string>>(endpoint, {
                method: 'POST',
                body: corpo,
            });
            onCaricata(risposta[campo]);
            message.success('Foto caricata.');
            onSuccess?.(risposta);
        } catch (error) {
            message.error(messageOf(error));
            onError?.(error instanceof Error ? error : new Error('caricamento fallito'));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Upload accept={ACCETTATI} customRequest={carica} showUploadList={false} maxCount={1}>
            <Button icon={<UploadOutlined />} loading={inCorso}>
                Carica una foto
            </Button>
        </Upload>
    );
};
```

- [ ] **Step 7: Crea `backend/resources/js/admin/pages/ExerciseForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { App, Button, Drawer, Flex, Form, Input, Select, Space } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { PhotoUpload } from '@admin/components/PhotoUpload';
import { joinCsv, splitCsv } from '@admin/domain/csv';

interface Props {
    riga: ExerciseRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    name: string;
    muscleGroup: string;
    secondaryMuscles: string[];
    equipment: string[];
    instructions: string;
}

export const ExerciseForm = ({ riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const [foto, setFoto] = useState<string | null>(null);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto) {
            return;
        }

        setFoto(riga?.photo ?? null);

        if (riga === null) {
            form.resetFields();

            return;
        }

        form.setFieldsValue({
            name: riga.name,
            muscleGroup: riga.muscleGroup,
            secondaryMuscles: splitCsv(riga.secondaryMuscles),
            equipment: splitCsv(riga.equipment),
            instructions: riga.instructions ?? '',
        });
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        const corpo = {
            name: valori.name,
            muscleGroup: valori.muscleGroup,
            secondaryMuscles: joinCsv(valori.secondaryMuscles),
            equipment: joinCsv(valori.equipment),
            instructions: valori.instructions === '' ? null : valori.instructions,
        };

        setInCorso(true);

        try {
            if (riga === null) {
                await apiFetch('/api/admin/exercises', { method: 'POST', body: corpo });
            } else {
                await apiFetch(`/api/admin/exercises/${riga.id}`, { method: 'PATCH', body: corpo });
            }

            await client.invalidateQueries({ queryKey: ['exercises'] });
            await client.invalidateQueries({ queryKey: ['stats'] });
            message.success('Salvato.');
            onChiudi();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Drawer
            open={aperto}
            width={560}
            title={riga === null ? 'Nuovo esercizio' : riga.name}
            onClose={onChiudi}
            destroyOnHidden
            extra={
                <Space>
                    <Button onClick={onChiudi}>Annulla</Button>
                    <Button type="primary" loading={inCorso} onClick={() => void form.submit()}>
                        Salva
                    </Button>
                </Space>
            }
        >
            <Form form={form} layout="vertical" onFinish={salva} requiredMark={false}>
                <Form.Item
                    name="name"
                    label="Nome"
                    rules={[{ required: true, message: 'Serve un nome.' }, { max: 120 }]}
                >
                    <Input />
                </Form.Item>
                <Form.Item
                    name="muscleGroup"
                    label="Gruppo muscolare"
                    rules={[{ required: true, message: 'Serve un gruppo muscolare.' }]}
                >
                    <Select
                        options={opzioniTassonomia(gruppi.data)}
                        loading={gruppi.isPending}
                        showSearch
                        optionFilterProp="label"
                    />
                </Form.Item>
                <Form.Item name="secondaryMuscles" label="Muscoli secondari">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(gruppi.data)}
                        loading={gruppi.isPending}
                        optionFilterProp="label"
                        allowClear
                    />
                </Form.Item>
                <Form.Item name="equipment" label="Attrezzatura">
                    <Select
                        mode="multiple"
                        options={opzioniTassonomia(attrezzi.data)}
                        loading={attrezzi.isPending}
                        optionFilterProp="label"
                        allowClear
                    />
                </Form.Item>
                <Form.Item
                    name="instructions"
                    label="Come si esegue"
                    extra="128 esercizi su 200 sono rimasti senza per mesi: e' il campo che il pannello esiste per riempire."
                    rules={[{ max: 2000 }]}
                >
                    <Input.TextArea rows={6} autoSize={{ minRows: 6, maxRows: 14 }} />
                </Form.Item>
            </Form>

            {/*
                La foto solo su una voce salvata: la rotta e'
                `POST /api/admin/exercises/{id}/photo` e in creazione l'id non
                esiste ancora.
            */}
            {riga !== null && (
                <Flex align="center" gap={16}>
                    <CatalogImage nome={foto} lato={72} />
                    <PhotoUpload
                        endpoint={`/api/admin/exercises/${riga.id}/photo`}
                        campo="photo"
                        onCaricata={(nome) => {
                            setFoto(nome);
                            void client.invalidateQueries({ queryKey: ['exercises'] });
                            void client.invalidateQueries({ queryKey: ['stats'] });
                        }}
                    />
                </Flex>
            )}
        </Drawer>
    );
};
```

- [ ] **Step 8: Scrivi il test che fallisce per la pagina**

Crea `backend/resources/js/admin/pages/ExercisesPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { ExercisesPage } from '@admin/pages/ExercisesPage';

const ESERCIZI = {
    data: [
        {
            id: 1,
            uid: 'ex-panca-piana-bilanciere',
            name: 'Panca piana',
            muscleGroup: 'petto',
            secondaryMuscles: 'tricipiti',
            equipment: 'bilanciere,panca',
            instructions: null,
            photo: null,
            status: 'published',
            createdAt: null,
            updatedAt: null,
        },
    ],
    meta: { total: 1, page: 1, lastPage: 1 },
};

const GRUPPI = { data: [{ id: 1, slug: 'petto', labelIt: 'Petto', labelEn: 'Chest', sort: 10 }] };

const rispondi = (url: string): Response =>
    new Response(JSON.stringify(url.startsWith('/api/admin/taxonomies') ? GRUPPI : ESERCIZI), {
        status: 200,
    });

const monta = (percorso: string): ReturnType<typeof vi.fn> => {
    const finta = vi.fn().mockImplementation((url: string) => Promise.resolve(rispondi(url)));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <RouterProvider
                    router={createMemoryRouter([{ path: '/esercizi', element: <ExercisesPage /> }], {
                        initialEntries: [percorso],
                    })}
                />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('ExercisesPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca gli esercizi e traduce lo slug del gruppo', async () => {
        monta('/esercizi');

        expect(await screen.findByText('Panca piana')).toBeDefined();
        expect(await screen.findByText('Petto')).toBeDefined();
    });

    it('porta nella richiesta il filtro che arriva dalla URL', async () => {
        const finta = monta('/esercizi?missing=instructions');

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].startsWith('/api/admin/exercises'),
            );
            expect(chiamata?.[0]).toContain('missing=instructions');
        });
    });
});
```

- [ ] **Step 9: Lancia e verifica che fallisca**

```bash
npm test -- ExercisesPage
```

Atteso: FAIL, `Unable to find an element with the text: Panca piana`.

- [ ] **Step 10: Riscrivi `backend/resources/js/admin/pages/ExercisesPage.tsx`**

```tsx
import { useState } from 'react';
import { App, Button, Input, Select, Space, Table, Tag, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { ExerciseRow, Paginato, TaxonomyRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { joinCsv, splitCsv } from '@admin/domain/csv';
import { PageHeader } from '@admin/layout/PageHeader';
import { ExerciseForm } from '@admin/pages/ExerciseForm';

/** Quante ne manda una pagina: `AdminExerciseController::PER_PAGE`. */
const PER_PAGINA = 50;

const etichetta = (righe: TaxonomyRow[] | undefined, slug: string): string =>
    righe?.find((r) => r.slug === slug)?.labelIt ?? slug;

export const ExercisesPage = (): React.ReactElement => {
    /*
     * I filtri stanno nella URL e non in uno stato locale: e' cosi' che il
     * link della dashboard ("Vedi quali", con `?missing=instructions`) apre
     * la pagina gia' filtrata, e che un filtro impostato sopravvive a un
     * ricaricamento.
     */
    const [parametri, setParametri] = useSearchParams();
    const [inModifica, setInModifica] = useState<ExerciseRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message, modal } = App.useApp();

    const scrivi = (chiave: string, valore: string | null): void => {
        const prossimi = new URLSearchParams(parametri);

        if (valore === null || valore === '') {
            prossimi.delete(chiave);
        } else {
            prossimi.set(chiave, valore);
        }

        // Cambiare un filtro riporta a pagina uno: restare alla nona pagina
        // di un elenco che ora ne ha due mostrerebbe una tabella vuota e
        // sembrerebbe che il filtro non abbia trovato niente.
        prossimi.delete('page');
        setParametri(prossimi);
    };

    const q = parametri.get('q') ?? '';
    const muscleGroup = parametri.get('muscleGroup') ?? '';
    const equipment = parametri.get('equipment') ?? '';
    const missing = parametri.get('missing') ?? '';
    const page = Number(parametri.get('page') ?? '1');

    const query = new URLSearchParams();
    if (q !== '') query.set('q', q);
    if (muscleGroup !== '') query.set('muscleGroup', muscleGroup);
    if (equipment !== '') query.set('equipment', equipment);
    if (missing !== '') query.set('missing', missing);
    query.set('page', String(page));

    const { data, isPending } = useQuery({
        queryKey: ['exercises', query.toString()],
        queryFn: () => apiFetch<Paginato<ExerciseRow>>(`/api/admin/exercises?${query.toString()}`),
    });

    const elimina = (riga: ExerciseRow): void => {
        modal.confirm({
            title: `Togliere "${riga.name}" dal catalogo?`,
            content:
                'La riga resta sul server marcata cancellata, ed e\' cosi\' che i telefoni vengono a sapere che non c\'e\' piu\'. Ricrearla con lo stesso nome la fa tornare com\'era.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/exercises/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: ['exercises'] });
                    await client.invalidateQueries({ queryKey: ['stats'] });
                    message.success('Tolto dal catalogo.');
                } catch (error) {
                    message.error(messageOf(error));
                    throw error;
                }
            },
        });
    };

    return (
        <>
            <PageHeader
                titolo="Esercizi"
                sottotitolo="Il catalogo comune: quel che sta qui arriva su ogni telefono."
                azione={
                    <Button
                        type="primary"
                        onClick={() => {
                            setInModifica(null);
                            setAperto(true);
                        }}
                    >
                        Nuovo esercizio
                    </Button>
                }
            />

            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    placeholder="Cerca per nome"
                    defaultValue={q}
                    allowClear
                    style={{ width: 240 }}
                    onSearch={(valore) => scrivi('q', valore)}
                />
                <Select
                    placeholder="Gruppo muscolare"
                    style={{ width: 200 }}
                    allowClear
                    value={muscleGroup === '' ? undefined : muscleGroup}
                    options={opzioniTassonomia(gruppi.data)}
                    onChange={(valore: string | undefined) => scrivi('muscleGroup', valore ?? null)}
                />
                <Select
                    placeholder="Attrezzatura"
                    style={{ width: 200 }}
                    allowClear
                    value={equipment === '' ? undefined : equipment}
                    options={opzioniTassonomia(attrezzi.data)}
                    onChange={(valore: string | undefined) => scrivi('equipment', valore ?? null)}
                />
                <Select
                    placeholder="Cosa manca"
                    style={{ width: 200 }}
                    allowClear
                    value={missing === '' ? undefined : missing}
                    options={[
                        { value: 'instructions', label: 'Senza descrizione' },
                        { value: 'photo', label: 'Senza foto' },
                    ]}
                    onChange={(valore: string | undefined) => scrivi('missing', valore ?? null)}
                />
            </Space>

            <Table<ExerciseRow>
                rowKey="id"
                loading={isPending}
                dataSource={data?.data ?? []}
                pagination={{
                    current: page,
                    pageSize: PER_PAGINA,
                    total: data?.meta.total ?? 0,
                    showSizeChanger: false,
                    onChange: (prossima) => scrivi('page', String(prossima)),
                }}
                columns={[
                    {
                        title: '',
                        dataIndex: 'photo',
                        width: 64,
                        render: (photo: string | null) => <CatalogImage nome={photo} />,
                    },
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Gruppo',
                        dataIndex: 'muscleGroup',
                        render: (slug: string) => etichetta(gruppi.data, slug),
                    },
                    {
                        title: 'Attrezzatura',
                        dataIndex: 'equipment',
                        render: (valore: string | null) => (
                            <Space wrap size={[4, 4]}>
                                {splitCsv(valore).map((slug) => (
                                    <Tag key={slug}>{etichetta(attrezzi.data, slug)}</Tag>
                                ))}
                            </Space>
                        ),
                    },
                    {
                        title: 'Descrizione',
                        dataIndex: 'instructions',
                        width: 120,
                        render: (testo: string | null) =>
                            testo === null || testo === '' ? (
                                <Typography.Text type="danger">manca</Typography.Text>
                            ) : (
                                <Typography.Text type="secondary">c&apos;e&apos;</Typography.Text>
                            ),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 120,
                        render: (stato: string) => (
                            <Tag color={stato === 'published' ? 'green' : 'default'}>{stato}</Tag>
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 190,
                        render: (_, riga) => (
                            <Space>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setInModifica(riga);
                                        setAperto(true);
                                    }}
                                >
                                    Correggi
                                </Button>
                                <Button size="small" danger onClick={() => elimina(riga)}>
                                    Elimina
                                </Button>
                            </Space>
                        ),
                    },
                ]}
            />

            <ExerciseForm riga={inModifica} aperto={aperto} onChiudi={() => setAperto(false)} />
        </>
    );
};
```

Se `joinCsv` risulta non usato in questo file (lo usa `ExerciseForm`), togli l'import: `noUnusedLocals` lo segnala.

- [ ] **Step 11: Lancia e verifica che passi**

```bash
npm test -- ExercisesPage
```

Atteso: PASS, 2 test.

- [ ] **Step 12: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test && npm run build
git add resources/js/admin/domain resources/js/admin/components resources/js/admin/pages/ExerciseForm.tsx resources/js/admin/pages/ExercisesPage.tsx resources/js/admin/pages/ExercisesPage.test.tsx
git commit -m "$(cat <<'EOF'
feat(admin): the exercises catalogue

Table with the four filters the server supports, a full form, and the photo
upload - the only request in the whole panel that does not send JSON.

The filters live in the query string, not in local state. That is what makes
the dashboard's "Vedi quali" link (`?missing=instructions`) open the page
already filtered, and what makes a filter survive a reload. Changing one resets
to page 1: staying on page nine of a list that now has two would show an empty
table and read as "the filter found nothing".

`equipment` and `secondary_muscles` are comma-separated lists inside a string,
not child tables - the server filters them with a LIKE on `',' || col || ','`.
The form shows them as multiple selects and converts at the two edges, in
splitCsv/joinCsv, never by hand in a screen. An empty list becomes null rather
than an empty string: the column is nullable and `,,` would match a search for
an attachment whose slug is empty.

PhotoUpload goes through apiFetch with customRequest. AntD's built-in upload
does its own fetch, without the session cookie and without the CSRF token, so
every upload would come back 419. The upload box only appears on a saved row,
because the route is POST .../{id}/photo and there is no id while creating.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
EOF
)"
```

---

### Task 8: Gli alimenti

L'unica pagina con del calcolo dentro, ed e' uno dei due test di componente che la spec chiede espressamente: le kcal ricalcolate dai macro.

**Files:**
- Create: `backend/resources/js/admin/domain/nutrition.ts`
- Test: `backend/resources/js/admin/domain/nutrition.test.ts`
- Create: `backend/resources/js/admin/pages/FoodForm.tsx`
- Test: `backend/resources/js/admin/pages/FoodForm.test.tsx`
- Modify: `backend/resources/js/admin/pages/FoodsPage.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `FoodRow`, `Paginato`, `CatalogImage`, `PhotoUpload`, `PageHeader`.
- Produces:
  - `kcalFromMacros(protein: number | null, carbs: number | null, fat: number | null): number`
  - `macrosDiverge(kcal: number | null, daiMacro: number): boolean`
  - `<FoodForm riga aperto onChiudi />`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/domain/nutrition.test.ts`:

```ts
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
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- nutrition
```

Atteso: FAIL, `Failed to resolve import "@admin/domain/nutrition"`.

- [ ] **Step 3: Crea `backend/resources/js/admin/domain/nutrition.ts`**

```ts
/** Le kcal che i macro dichiarati spiegano: 4 per grammo di proteine e carboidrati, 9 per i grassi. */
export function kcalFromMacros(
    protein: number | null,
    carbs: number | null,
    fat: number | null,
): number {
    return Math.round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9);
}

/**
 * Le kcal scritte litigano con i macro scritti?
 *
 * Non e' una validazione e non blocca il salvataggio: la formula non conosce
 * fibre, polioli e alcol, e su un prodotto vero uno scarto di qualche punto e'
 * normale. Serve a intercettare la virgola sbagliata - 400 kcal su macro che
 * ne spiegano 165 - che e' l'errore che poi si porta dietro ogni pasto
 * registrato con quell'alimento.
 *
 * Due soglie insieme: il dieci per cento, e venti kcal in assoluto. Solo la
 * percentuale farebbe gridare per due kcal su venti; solo il valore assoluto
 * tacerebbe su cinquanta kcal di scarto su ottocento.
 */
export function macrosDiverge(kcal: number | null, daiMacro: number): boolean {
    if (kcal === null || daiMacro === 0) {
        return false;
    }

    const scarto = Math.abs(kcal - daiMacro);

    return scarto > 20 && scarto > kcal * 0.1;
}
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- nutrition
```

Atteso: PASS, 7 test.

- [ ] **Step 5: Scrivi il test che fallisce per il form**

Crea `backend/resources/js/admin/pages/FoodForm.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FoodForm } from '@admin/pages/FoodForm';

const monta = (): void => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <FoodForm riga={null} aperto onChiudi={() => {}} />
            </QueryClientProvider>
        </AntApp>,
    );
};

describe('FoodForm', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    });

    it('dice quante kcal spiegano i macro scritti', async () => {
        monta();

        await userEvent.type(screen.getByLabelText('Proteine (g)'), '10');
        await userEvent.type(screen.getByLabelText('Carboidrati (g)'), '20');
        await userEvent.type(screen.getByLabelText('Grassi (g)'), '5');

        expect(await screen.findByText(/165 kcal/)).toBeDefined();
    });

    it('avvisa quando le kcal scritte litigano con i macro', async () => {
        monta();

        await userEvent.type(screen.getByLabelText('Proteine (g)'), '10');
        await userEvent.type(screen.getByLabelText('Carboidrati (g)'), '20');
        await userEvent.type(screen.getByLabelText('Grassi (g)'), '5');
        await userEvent.type(screen.getByLabelText('Energia (kcal)'), '400');

        expect(await screen.findByText(/non tornano con i macro/)).toBeDefined();
    });
});
```

- [ ] **Step 6: Lancia e verifica che fallisca**

```bash
npm test -- FoodForm
```

Atteso: FAIL, `Failed to resolve import "@admin/pages/FoodForm"`.

- [ ] **Step 7: Crea `backend/resources/js/admin/pages/FoodForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Drawer,
    Flex,
    Form,
    Input,
    InputNumber,
    Row,
    Space,
    Switch,
    Typography,
} from 'antd';
import type { FormInstance } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import type { FoodRow } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { PhotoUpload } from '@admin/components/PhotoUpload';
import { kcalFromMacros, macrosDiverge } from '@admin/domain/nutrition';

interface Props {
    riga: FoodRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

interface Valori {
    name: string;
    brand: string | null;
    barcode: string | null;
    kcal: number;
    protein: number | null;
    carbs: number | null;
    sugars: number | null;
    fat: number | null;
    saturatedFat: number | null;
    fiber: number | null;
    salt: number | null;
    isLiquid: boolean;
    defaultServingG: number | null;
    servingLabel: string | null;
}

/** I sette nutrienti con la loro etichetta. Il tetto e' `Food::MAX_NUTRIENT_GRAMS`. */
const NUTRIENTI: Array<{ nome: 'protein' | 'carbs' | 'sugars' | 'fat' | 'saturatedFat' | 'fiber' | 'salt'; label: string }> = [
    { nome: 'protein', label: 'Proteine (g)' },
    { nome: 'carbs', label: 'Carboidrati (g)' },
    { nome: 'sugars', label: 'di cui zuccheri (g)' },
    { nome: 'fat', label: 'Grassi (g)' },
    { nome: 'saturatedFat', label: 'di cui saturi (g)' },
    { nome: 'fiber', label: 'Fibre (g)' },
    { nome: 'salt', label: 'Sale (g)' },
];

/**
 * L'avviso sulle kcal.
 *
 * Un componente a se' e non una riga dentro il form: `Form.useWatch` ridisegna
 * chi lo chiama a ogni tasto, e messo accanto ai quindici campi li
 * ridisegnerebbe tutti mentre se ne scrive uno. E' la stessa ragione per cui
 * nell'app `KcalFromMacros` e' separato da `NutrientFields`.
 */
const AvvisoKcal = ({ form }: { form: FormInstance<Valori> }): React.ReactElement | null => {
    const protein = Form.useWatch('protein', form) ?? null;
    const carbs = Form.useWatch('carbs', form) ?? null;
    const fat = Form.useWatch('fat', form) ?? null;
    const kcal = Form.useWatch('kcal', form) ?? null;

    const daiMacro = kcalFromMacros(protein, carbs, fat);

    if (daiMacro === 0) {
        return null;
    }

    if (macrosDiverge(kcal, daiMacro)) {
        return (
            <Typography.Text type="warning">
                Le {kcal} kcal scritte non tornano con i macro, che ne spiegano {daiMacro}.
            </Typography.Text>
        );
    }

    return (
        <Typography.Text type="secondary">I macro scritti spiegano {daiMacro} kcal.</Typography.Text>
    );
};

export const FoodForm = ({ riga, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Valori>();
    const [inCorso, setInCorso] = useState(false);
    const [immagine, setImmagine] = useState<string | null>(null);
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto) {
            return;
        }

        setImmagine(riga?.image ?? null);

        if (riga === null) {
            form.resetFields();

            return;
        }

        form.setFieldsValue({
            name: riga.name,
            brand: riga.brand,
            barcode: riga.barcode,
            kcal: riga.kcal,
            protein: riga.protein,
            carbs: riga.carbs,
            sugars: riga.sugars,
            fat: riga.fat,
            saturatedFat: riga.saturatedFat,
            fiber: riga.fiber,
            salt: riga.salt,
            isLiquid: riga.isLiquid,
            defaultServingG: riga.defaultServingG,
            servingLabel: riga.servingLabel,
        });
    }, [aperto, riga, form]);

    const salva = async (valori: Valori): Promise<void> => {
        setInCorso(true);

        try {
            if (riga === null) {
                await apiFetch('/api/admin/foods', { method: 'POST', body: { ...valori } });
            } else {
                await apiFetch(`/api/admin/foods/${riga.id}`, { method: 'PATCH', body: { ...valori } });
            }

            await client.invalidateQueries({ queryKey: ['foods'] });
            await client.invalidateQueries({ queryKey: ['stats'] });
            message.success('Salvato.');
            onChiudi();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Drawer
            open={aperto}
            width={620}
            title={riga === null ? 'Nuovo alimento' : riga.name}
            onClose={onChiudi}
            destroyOnHidden
            extra={
                <Space>
                    <Button onClick={onChiudi}>Annulla</Button>
                    <Button type="primary" loading={inCorso} onClick={() => void form.submit()}>
                        Salva
                    </Button>
                </Space>
            }
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={salva}
                requiredMark={false}
                initialValues={{ isLiquid: false }}
            >
                <Row gutter={16}>
                    <Col span={14}>
                        <Form.Item
                            name="name"
                            label="Nome"
                            rules={[{ required: true, message: 'Serve un nome.' }, { max: 120 }]}
                        >
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item name="brand" label="Marca" rules={[{ max: 60 }]}>
                            <Input />
                        </Form.Item>
                    </Col>
                </Row>

                <Typography.Title level={5}>Per 100 g</Typography.Title>
                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item
                            name="kcal"
                            label="Energia (kcal)"
                            rules={[{ required: true, message: 'Servono le kcal.' }]}
                        >
                            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    {NUTRIENTI.map(({ nome, label }) => (
                        <Col span={8} key={nome}>
                            <Form.Item name={nome} label={label}>
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                    ))}
                </Row>
                <div style={{ marginBottom: 16 }}>
                    <AvvisoKcal form={form} />
                </div>

                <Row gutter={16}>
                    <Col span={8}>
                        <Form.Item name="defaultServingG" label="Porzione (g)">
                            <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item
                            name="servingLabel"
                            label="Come si dice"
                            extra="&quot;1 vasetto = 125 g&quot;: la frase che risponde alla domanda che uno si fa mentre digita i grammi."
                            rules={[{ max: 40 }]}
                        >
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item name="isLiquid" label="Liquido" valuePropName="checked">
                            <Switch />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item
                    name="barcode"
                    label="Codice a barre"
                    extra="Identita' esatta: due prodotti con lo stesso codice sono lo stesso prodotto."
                    rules={[{ max: 32 }]}
                >
                    <Input />
                </Form.Item>
            </Form>

            {riga !== null && (
                <Flex align="center" gap={16}>
                    <CatalogImage nome={immagine} lato={72} />
                    <PhotoUpload
                        endpoint={`/api/admin/foods/${riga.id}/image`}
                        campo="image"
                        onCaricata={(nome) => {
                            setImmagine(nome);
                            void client.invalidateQueries({ queryKey: ['foods'] });
                        }}
                    />
                </Flex>
            )}
        </Drawer>
    );
};
```

- [ ] **Step 8: Lancia e verifica che passi**

```bash
npm test -- FoodForm
```

Atteso: PASS, 2 test.

- [ ] **Step 9: Riscrivi `backend/resources/js/admin/pages/FoodsPage.tsx`**

```tsx
import { useState } from 'react';
import { App, Button, Input, Space, Table, Tag, Typography } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { messageOf } from '@admin/api/errors';
import type { FoodRow, Paginato } from '@admin/api/types';
import { CatalogImage } from '@admin/components/CatalogImage';
import { PageHeader } from '@admin/layout/PageHeader';
import { FoodForm } from '@admin/pages/FoodForm';

/** Quanti ne manda una pagina: `AdminFoodController::PER_PAGE`. */
const PER_PAGINA = 50;

export const FoodsPage = (): React.ReactElement => {
    const [parametri, setParametri] = useSearchParams();
    const [inModifica, setInModifica] = useState<FoodRow | null>(null);
    const [aperto, setAperto] = useState(false);
    const client = useQueryClient();
    const { message, modal } = App.useApp();

    const scrivi = (chiave: string, valore: string | null): void => {
        const prossimi = new URLSearchParams(parametri);

        if (valore === null || valore === '') {
            prossimi.delete(chiave);
        } else {
            prossimi.set(chiave, valore);
        }

        prossimi.delete('page');
        setParametri(prossimi);
    };

    const q = parametri.get('q') ?? '';
    const barcode = parametri.get('barcode') ?? '';
    const page = Number(parametri.get('page') ?? '1');

    const query = new URLSearchParams();
    if (q !== '') query.set('q', q);
    if (barcode !== '') query.set('barcode', barcode);
    query.set('page', String(page));

    const { data, isPending } = useQuery({
        queryKey: ['foods', query.toString()],
        queryFn: () => apiFetch<Paginato<FoodRow>>(`/api/admin/foods?${query.toString()}`),
    });

    const elimina = (riga: FoodRow): void => {
        modal.confirm({
            title: `Togliere "${riga.name}" dal catalogo?`,
            content:
                'La riga resta sul server marcata cancellata, ed e\' cosi\' che i telefoni vengono a sapere che non c\'e\' piu\'.',
            okText: 'Elimina',
            okButtonProps: { danger: true },
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    await apiFetch(`/api/admin/foods/${riga.id}`, { method: 'DELETE' });
                    await client.invalidateQueries({ queryKey: ['foods'] });
                    await client.invalidateQueries({ queryKey: ['stats'] });
                    message.success('Tolto dal catalogo.');
                } catch (error) {
                    message.error(messageOf(error));
                    throw error;
                }
            },
        });
    };

    return (
        <>
            <PageHeader
                titolo="Alimenti"
                sottotitolo="Il catalogo comune degli alimenti."
                azione={
                    <Button
                        type="primary"
                        onClick={() => {
                            setInModifica(null);
                            setAperto(true);
                        }}
                    >
                        Nuovo alimento
                    </Button>
                }
            />

            <Space wrap style={{ marginBottom: 16 }}>
                <Input.Search
                    placeholder="Cerca per nome"
                    defaultValue={q}
                    allowClear
                    style={{ width: 240 }}
                    onSearch={(valore) => scrivi('q', valore)}
                />
                <Input.Search
                    placeholder="Codice a barre esatto"
                    defaultValue={barcode}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(valore) => scrivi('barcode', valore)}
                />
            </Space>

            <Table<FoodRow>
                rowKey="id"
                loading={isPending}
                dataSource={data?.data ?? []}
                pagination={{
                    current: page,
                    pageSize: PER_PAGINA,
                    total: data?.meta.total ?? 0,
                    showSizeChanger: false,
                    onChange: (prossima) => scrivi('page', String(prossima)),
                }}
                columns={[
                    {
                        title: '',
                        dataIndex: 'image',
                        width: 64,
                        render: (image: string | null) => <CatalogImage nome={image} />,
                    },
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Marca',
                        dataIndex: 'brand',
                        render: (marca: string | null) =>
                            marca ?? <Typography.Text type="secondary">-</Typography.Text>,
                    },
                    { title: 'kcal', dataIndex: 'kcal', width: 90 },
                    {
                        title: 'Provenienza',
                        dataIndex: 'offId',
                        width: 150,
                        /*
                         * Da dove vengono i valori, che e' l'unica cosa che
                         * dice quanto fidarsene: OpenFoodFacts lo compila
                         * chiunque.
                         */
                        render: (offId: string | null) =>
                            offId === null ? (
                                <Typography.Text type="secondary">a mano</Typography.Text>
                            ) : (
                                <Tag>OpenFoodFacts</Tag>
                            ),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 120,
                        render: (stato: string) => (
                            <Tag color={stato === 'published' ? 'green' : 'default'}>{stato}</Tag>
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 190,
                        render: (_, riga) => (
                            <Space>
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setInModifica(riga);
                                        setAperto(true);
                                    }}
                                >
                                    Correggi
                                </Button>
                                <Button size="small" danger onClick={() => elimina(riga)}>
                                    Elimina
                                </Button>
                            </Space>
                        ),
                    },
                ]}
            />

            <FoodForm riga={inModifica} aperto={aperto} onChiudi={() => setAperto(false)} />
        </>
    );
};
```

- [ ] **Step 10: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test && npm run build
git add resources/js/admin/domain/nutrition.ts resources/js/admin/domain/nutrition.test.ts resources/js/admin/pages/FoodForm.tsx resources/js/admin/pages/FoodForm.test.tsx resources/js/admin/pages/FoodsPage.tsx
git commit -m "$(cat <<'PLAN_EOF'
feat(admin): the foods catalogue

The only page with arithmetic in it, and one of the two component tests the
spec asks for by name: kcal recomputed from the macros.

The warning fires on two thresholds together, ten per cent and twenty kcal in
absolute terms. The percentage alone would shout over two kcal out of twenty;
the absolute value alone would stay quiet over fifty kcal of drift out of eight
hundred. It never blocks a save: the formula knows nothing of fibre, polyols
and alcohol, so a few points of drift on a real product is normal. What it
catches is the misplaced decimal - 400 kcal on macros that explain 165 - which
otherwise rides along in every meal logged with that food.

The warning lives in its own component. `Form.useWatch` re-renders whoever
calls it on every keystroke, and next to the fifteen fields it would redraw all
of them while one is being typed. Same reason `KcalFromMacros` is separate from
`NutrientFields` in the app.

The list shows provenance, because it is the one column that says how much to
trust the numbers: OpenFoodFacts is filled in by anyone.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
PLAN_EOF
)"
```

---
### Task 9: La coda di revisione

L'unico posto del pannello dove si vede chi ha proposto cosa, e l'altro test di componente che la spec chiede: la revisione con correzione.

**Una precisazione sulla "coda unica".** La spec la descrive come una coda sola per i due tipi. Il server non la serve cosi': `SubmissionController::index` prende **un** `type` alla volta (`exercise` per default) e i due modelli hanno colonne diverse. Qui la coda e' quindi un interruttore a due segmenti sopra una tabella sola - un gesto, due elenchi - e non due pagine di menu diverse. Fonderle davvero vorrebbe dire due richieste e un ordinamento lato client su due insiemi paginati a cento ciascuno, cioe' un elenco che dice "cento" quando ce ne sono centoventi. Se un giorno serve, il posto dove aggiustarlo e' il server.

**Files:**
- Modify: `backend/package.json` (aggiunge `dayjs`)
- Create: `backend/resources/js/admin/domain/changes.ts`
- Test: `backend/resources/js/admin/domain/changes.test.ts`
- Create: `backend/resources/js/admin/pages/ReviewDrawer.tsx`
- Test: `backend/resources/js/admin/pages/ReviewDrawer.test.tsx`
- Modify: `backend/resources/js/admin/pages/SubmissionsPage.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError`, `SubmissionRow`, `SubmissionType`, `Elenco`, `opzioniTassonomia`, `useTaxonomy`, `splitCsv`, `joinCsv`, `PageHeader`.
- Produces:
  - `changedFields<T extends Record<string, unknown>>(prima: T, dopo: T): Partial<T>`
  - `<ReviewDrawer proposta aperto onChiudi />`

- [ ] **Step 1: Installa `dayjs`**

```bash
npm install dayjs
```

E' gia' in `node_modules` come dipendenza di AntD, ma dipendere di straforo da una dipendenza altrui vuol dire che il giorno che AntD cambia data library il pannello si rompe senza aver toccato niente.

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/domain/changes.test.ts`:

```ts
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
```

- [ ] **Step 3: Lancia e verifica che fallisca**

```bash
npm test -- changes
```

Atteso: FAIL, `Failed to resolve import "@admin/domain/changes"`.

- [ ] **Step 4: Crea `backend/resources/js/admin/domain/changes.ts`**

```ts
/**
 * Cosa e' cambiato fra come la proposta e' arrivata e come la si approva.
 *
 * Serve perche' `approve` accetta le correzioni nello stesso corpo
 * dell'approvazione - in revisione si corregge MENTRE si guarda - e i campi
 * che nessuno ha toccato non vanno rimandati: `SubmissionController::
 * applicaCorrezioni` scrive quel che riceve, e mandare tutto vorrebbe dire
 * riscrivere il nome (e passare dal controllo di unicita' su `name_norm`) di
 * una voce a cui il nome non e' stato toccato.
 *
 * Il confronto e' su valori scalari, che e' tutto quel che questi form
 * producono: gli elenchi (`equipment`, `secondaryMuscles`) arrivano qui gia'
 * ridotti a stringa da `joinCsv`.
 */
export function changedFields<T extends Record<string, unknown>>(prima: T, dopo: T): Partial<T> {
    const cambiati: Partial<T> = {};

    for (const chiave of Object.keys(dopo) as Array<keyof T>) {
        if (!Object.is(prima[chiave], dopo[chiave])) {
            cambiati[chiave] = dopo[chiave];
        }
    }

    return cambiati;
}
```

- [ ] **Step 5: Lancia e verifica che passi**

```bash
npm test -- changes
```

Atteso: PASS, 5 test.

- [ ] **Step 6: Scrivi il test che fallisce per la revisione**

Crea `backend/resources/js/admin/pages/ReviewDrawer.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewDrawer } from '@admin/pages/ReviewDrawer';
import type { SubmissionRow } from '@admin/api/types';

const PROPOSTA: SubmissionRow = {
    id: 12,
    type: 'food',
    uid: 'f-1',
    name: 'Riso',
    status: 'pending',
    reviewNote: null,
    createdAt: '2026-09-01T10:00:00+00:00',
    author: { handle: 'tizio', displayName: 'Tizio' },
    fields: {
        brand: null,
        barcode: null,
        offId: null,
        kcal: 350,
        protein: 7,
        carbs: 78,
        sugars: null,
        fat: 1,
        saturatedFat: null,
        fiber: null,
        salt: null,
        isLiquid: false,
        defaultServingG: null,
        servingLabel: null,
        image: null,
    },
};

const monta = (): ReturnType<typeof vi.fn> => {
    const finta = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <ReviewDrawer proposta={PROPOSTA} aperto onChiudi={() => {}} />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('ReviewDrawer', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('dice chi ha proposto: e\' l\'unico posto dove si vede', async () => {
        monta();

        expect(await screen.findByText('Tizio')).toBeDefined();
    });

    it('approvando manda SOLO il campo corretto', async () => {
        const finta = monta();

        const nome = await screen.findByLabelText('Nome');
        await userEvent.clear(nome);
        await userEvent.type(nome, 'Riso basmati');
        await userEvent.click(screen.getByRole('button', { name: 'Approva' }));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find(
                (c) => typeof c[0] === 'string' && c[0].includes('/approve'),
            );
            expect(chiamata?.[0]).toBe('/api/admin/submissions/food/12/approve');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({ name: 'Riso basmati' });
        });
    });

    it('rifiutare senza una nota non si puo\': la nota e\' l\'unica cosa che resta all\'autore', async () => {
        const finta = monta();

        await userEvent.click(await screen.findByRole('button', { name: 'Rifiuta' }));

        await waitFor(() => {
            expect(screen.getByText('Scrivi perche\' viene rifiutata.')).toBeDefined();
        });
        expect(
            finta.mock.calls.find((c) => typeof c[0] === 'string' && c[0].includes('/reject')),
        ).toBeUndefined();
    });
});
```

- [ ] **Step 7: Lancia e verifica che fallisca**

```bash
npm test -- ReviewDrawer
```

Atteso: FAIL, `Failed to resolve import "@admin/pages/ReviewDrawer"`.

- [ ] **Step 8: Crea `backend/resources/js/admin/pages/ReviewDrawer.tsx`**

```tsx
import { useEffect, useState } from 'react';
import {
    App,
    Button,
    Col,
    Descriptions,
    Drawer,
    Form,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Switch,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import { opzioniTassonomia, useTaxonomy } from '@admin/api/taxonomies';
import type { SubmissionRow } from '@admin/api/types';
import { changedFields } from '@admin/domain/changes';
import { joinCsv, splitCsv } from '@admin/domain/csv';

interface Props {
    proposta: SubmissionRow | null;
    aperto: boolean;
    onChiudi: () => void;
}

/*
 * `fields` arriva come `Record<string, unknown>` perche' la sua forma dipende
 * dal tipo. Tre letture strette invece di un cast: il server puo' mandare
 * `null` su qualunque colonna nullable, e un `as number` su un null farebbe
 * scrivere "null" dentro un campo numerico senza che niente protesti.
 */
const testo = (valore: unknown): string | null => (typeof valore === 'string' ? valore : null);
const numero = (valore: unknown): number | null => (typeof valore === 'number' ? valore : null);
const booleano = (valore: unknown): boolean => valore === true;

/** I campi che si correggono, per tipo, gia' nella forma che il server accetta. */
function valoriIniziali(proposta: SubmissionRow): Record<string, unknown> {
    const f = proposta.fields;

    if (proposta.type === 'exercise') {
        return {
            name: proposta.name,
            muscleGroup: testo(f.muscleGroup) ?? '',
            secondaryMuscles: testo(f.secondaryMuscles),
            equipment: testo(f.equipment),
            instructions: testo(f.instructions),
        };
    }

    return {
        name: proposta.name,
        brand: testo(f.brand),
        barcode: testo(f.barcode),
        kcal: numero(f.kcal) ?? 0,
        protein: numero(f.protein),
        carbs: numero(f.carbs),
        sugars: numero(f.sugars),
        fat: numero(f.fat),
        saturatedFat: numero(f.saturatedFat),
        fiber: numero(f.fiber),
        salt: numero(f.salt),
        isLiquid: booleano(f.isLiquid),
        defaultServingG: numero(f.defaultServingG),
        servingLabel: testo(f.servingLabel),
    };
}

const NUTRIENTI: Array<[string, string]> = [
    ['protein', 'Proteine (g)'],
    ['carbs', 'Carboidrati (g)'],
    ['sugars', 'Zuccheri (g)'],
    ['fat', 'Grassi (g)'],
    ['saturatedFat', 'Saturi (g)'],
    ['fiber', 'Fibre (g)'],
    ['salt', 'Sale (g)'],
];

export const ReviewDrawer = ({ proposta, aperto, onChiudi }: Props): React.ReactElement => {
    const [form] = Form.useForm<Record<string, unknown>>();
    const [nota, setNota] = useState('');
    const [erroreNota, setErroreNota] = useState<string | null>(null);
    const [inCorso, setInCorso] = useState(false);
    const gruppi = useTaxonomy('muscle-groups');
    const attrezzi = useTaxonomy('equipment');
    const client = useQueryClient();
    const { message } = App.useApp();

    useEffect(() => {
        if (!aperto || proposta === null) {
            return;
        }

        setNota('');
        setErroreNota(null);

        const iniziali = valoriIniziali(proposta);
        form.setFieldsValue(
            proposta.type === 'exercise'
                ? {
                      ...iniziali,
                      // Le due colonne a virgole diventano tendine, e tornano
                      // stringa al momento di mandarle.
                      secondaryMuscles: splitCsv(testo(proposta.fields.secondaryMuscles)),
                      equipment: splitCsv(testo(proposta.fields.equipment)),
                  }
                : iniziali,
        );
    }, [aperto, proposta, form]);

    if (proposta === null) {
        return <Drawer open={false} onClose={onChiudi} />;
    }

    const dopoLaDecisione = async (): Promise<void> => {
        await client.invalidateQueries({ queryKey: ['submissions'] });
        await client.invalidateQueries({ queryKey: ['stats'] });
        onChiudi();
    };

    const approva = async (): Promise<void> => {
        const valori = form.getFieldsValue();
        const dopo =
            proposta.type === 'exercise'
                ? {
                      ...valori,
                      secondaryMuscles: joinCsv(valori.secondaryMuscles as string[] | undefined),
                      equipment: joinCsv(valori.equipment as string[] | undefined),
                  }
                : valori;

        /*
         * Solo le correzioni. `approve` scrive quel che riceve, e rimandare
         * anche i campi non toccati farebbe ripassare il nome dal controllo
         * di unicita' su `name_norm` per una voce a cui nessuno ha cambiato
         * il nome.
         */
        const correzioni = changedFields(valoriIniziali(proposta), dopo);

        setInCorso(true);

        try {
            await apiFetch(`/api/admin/submissions/${proposta.type}/${proposta.id}/approve`, {
                method: 'POST',
                body: correzioni,
            });
            message.success('Approvata: e\' nel catalogo di tutti.');
            await dopoLaDecisione();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    const rifiuta = async (): Promise<void> => {
        /*
         * La nota e' obbligatoria QUI e non sul server, dove `note` e'
         * `sometimes`: e' l'unica traccia del perche', e il giorno che
         * all'autore lo si dira' - la spec dice che oggi non c'e' ancora
         * niente che gliela mostri - una nota vuota non gli direbbe niente.
         */
        if (nota.trim() === '') {
            setErroreNota('Scrivi perche\' viene rifiutata.');

            return;
        }

        setInCorso(true);

        try {
            await apiFetch(`/api/admin/submissions/${proposta.type}/${proposta.id}/reject`, {
                method: 'POST',
                body: { note: nota.trim() },
            });
            message.success('Rifiutata. Resta sul telefono di chi l\'ha scritta.');
            await dopoLaDecisione();
        } catch (error) {
            message.error(messageOf(error));
        } finally {
            setInCorso(false);
        }
    };

    return (
        <Drawer
            open={aperto}
            width={620}
            title={proposta.name}
            onClose={onChiudi}
            destroyOnHidden
            extra={
                <Space>
                    <Button danger loading={inCorso} onClick={() => void rifiuta()}>
                        Rifiuta
                    </Button>
                    <Button type="primary" loading={inCorso} onClick={() => void approva()}>
                        Approva
                    </Button>
                </Space>
            }
        >
            <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Tipo">
                    {proposta.type === 'exercise' ? 'Esercizio' : 'Alimento'}
                </Descriptions.Item>
                {/* L'unico posto del pannello dove si vede chi ha proposto. */}
                <Descriptions.Item label="Proposta da">
                    {proposta.author?.displayName ?? 'autore cancellato'}
                </Descriptions.Item>
                <Descriptions.Item label="Il">
                    {proposta.createdAt === null
                        ? '-'
                        : new Date(proposta.createdAt).toLocaleDateString('it-IT')}
                </Descriptions.Item>
            </Descriptions>

            <Form form={form} layout="vertical" requiredMark={false}>
                <Form.Item name="name" label="Nome">
                    <Input />
                </Form.Item>

                {proposta.type === 'exercise' ? (
                    <>
                        <Form.Item name="muscleGroup" label="Gruppo muscolare">
                            <Select
                                options={opzioniTassonomia(gruppi.data)}
                                showSearch
                                optionFilterProp="label"
                            />
                        </Form.Item>
                        <Form.Item name="secondaryMuscles" label="Muscoli secondari">
                            <Select
                                mode="multiple"
                                options={opzioniTassonomia(gruppi.data)}
                                optionFilterProp="label"
                                allowClear
                            />
                        </Form.Item>
                        <Form.Item name="equipment" label="Attrezzatura">
                            <Select
                                mode="multiple"
                                options={opzioniTassonomia(attrezzi.data)}
                                optionFilterProp="label"
                                allowClear
                            />
                        </Form.Item>
                        <Form.Item name="instructions" label="Come si esegue">
                            <Input.TextArea rows={5} />
                        </Form.Item>
                    </>
                ) : (
                    <>
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item name="brand" label="Marca">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="barcode" label="Codice a barre">
                                    <Input />
                                </Form.Item>
                            </Col>
                        </Row>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="kcal" label="Energia (kcal)">
                                    <InputNumber min={0} max={1000} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            {NUTRIENTI.map(([nome, label]) => (
                                <Col span={8} key={nome}>
                                    <Form.Item name={nome} label={label}>
                                        <InputNumber min={0} max={100} style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                            ))}
                        </Row>
                        <Row gutter={16}>
                            <Col span={8}>
                                <Form.Item name="defaultServingG" label="Porzione (g)">
                                    <InputNumber min={0} max={9999} style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>
                            <Col span={10}>
                                <Form.Item name="servingLabel" label="Come si dice">
                                    <Input />
                                </Form.Item>
                            </Col>
                            <Col span={6}>
                                <Form.Item name="isLiquid" label="Liquido" valuePropName="checked">
                                    <Switch />
                                </Form.Item>
                            </Col>
                        </Row>
                    </>
                )}
            </Form>

            <Form.Item
                label="Nota di rifiuto"
                validateStatus={erroreNota === null ? undefined : 'error'}
                help={erroreNota ?? 'Serve solo per rifiutare. Non e\' ancora mostrata all\'autore.'}
            >
                <Input.TextArea
                    rows={3}
                    maxLength={500}
                    value={nota}
                    onChange={(e) => {
                        setNota(e.target.value);
                        setErroreNota(null);
                    }}
                />
            </Form.Item>
        </Drawer>
    );
};
```

- [ ] **Step 9: Lancia e verifica che passi**

```bash
npm test -- ReviewDrawer
```

Atteso: PASS, 3 test.

- [ ] **Step 10: Riscrivi `backend/resources/js/admin/pages/SubmissionsPage.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Input, Segmented, Select, Space, Table, Tag } from 'antd';
import type { Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import type { Elenco, SubmissionRow, SubmissionType } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';
import { ReviewDrawer } from '@admin/pages/ReviewDrawer';

export const SubmissionsPage = (): React.ReactElement => {
    const [parametri, setParametri] = useSearchParams();
    const [autore, setAutore] = useState<string | undefined>(undefined);
    const [periodo, setPeriodo] = useState<[Dayjs, Dayjs] | null>(null);
    const [inRevisione, setInRevisione] = useState<SubmissionRow | null>(null);
    const [aperto, setAperto] = useState(false);

    const type = (parametri.get('type') ?? 'exercise') as SubmissionType;
    const status = parametri.get('status') ?? 'pending';
    const q = parametri.get('q') ?? '';

    const scrivi = (chiave: string, valore: string): void => {
        const prossimi = new URLSearchParams(parametri);
        prossimi.set(chiave, valore);
        setParametri(prossimi);
    };

    const query = new URLSearchParams({ type, status });
    if (q !== '') query.set('q', q);

    const { data, isPending } = useQuery({
        queryKey: ['submissions', query.toString()],
        queryFn: () =>
            apiFetch<Elenco<SubmissionRow>>(`/api/admin/submissions?${query.toString()}`).then(
                (r) => r.data,
            ),
    });

    /*
     * Autore e data si filtrano QUI e non sul server, che non li accetta:
     * `SubmissionController::index` conosce `type`, `status` e `q`, e manda al
     * massimo cento righe ordinate per data. Su cento righe gia' in mano un
     * filtro lato client e' esatto quanto uno lato server; se un giorno la
     * coda superasse le cento, il filtro va portato di la' - e allora si
     * vedrebbe, perche' la tabella direbbe cento.
     */
    const autori = useMemo(() => {
        const visti = new Map<string, string>();

        for (const riga of data ?? []) {
            if (riga.author !== null) {
                visti.set(riga.author.handle, riga.author.displayName);
            }
        }

        return [...visti].map(([value, label]) => ({ value, label }));
    }, [data]);

    const righe = useMemo(
        () =>
            (data ?? []).filter((riga) => {
                if (autore !== undefined && riga.author?.handle !== autore) {
                    return false;
                }

                if (periodo === null || riga.createdAt === null) {
                    return periodo === null;
                }

                const quando = new Date(riga.createdAt).getTime();

                return (
                    quando >= periodo[0].startOf('day').valueOf() &&
                    quando <= periodo[1].endOf('day').valueOf()
                );
            }),
        [data, autore, periodo],
    );

    return (
        <>
            <PageHeader
                titolo="Proposte"
                sottotitolo="Quel che gli utenti si sono creati sul telefono, in attesa di entrare nel catalogo di tutti."
            />

            <Space wrap style={{ marginBottom: 16 }}>
                <Segmented
                    value={type}
                    options={[
                        { value: 'exercise', label: 'Esercizi' },
                        { value: 'food', label: 'Alimenti' },
                    ]}
                    onChange={(valore) => scrivi('type', String(valore))}
                />
                <Select
                    value={status}
                    style={{ width: 160 }}
                    options={[
                        { value: 'pending', label: 'In attesa' },
                        { value: 'published', label: 'Approvate' },
                        { value: 'rejected', label: 'Rifiutate' },
                    ]}
                    onChange={(valore: string) => scrivi('status', valore)}
                />
                <Input.Search
                    placeholder="Cerca per nome"
                    defaultValue={q}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(valore) => scrivi('q', valore)}
                />
                <Select
                    placeholder="Autore"
                    style={{ width: 180 }}
                    allowClear
                    value={autore}
                    options={autori}
                    onChange={setAutore}
                />
                <DatePicker.RangePicker
                    value={periodo}
                    onChange={(valori) =>
                        setPeriodo(
                            valori === null || valori[0] === null || valori[1] === null
                                ? null
                                : [valori[0], valori[1]],
                        )
                    }
                />
            </Space>

            <Table<SubmissionRow>
                rowKey={(riga) => `${riga.type}-${riga.id}`}
                loading={isPending}
                dataSource={righe}
                pagination={false}
                locale={{
                    emptyText: (
                        <Empty
                            description={
                                status === 'pending'
                                    ? 'Niente in attesa. Il catalogo e\' in pari.'
                                    : 'Nessuna proposta con questi filtri.'
                            }
                        />
                    ),
                }}
                columns={[
                    { title: 'Nome', dataIndex: 'name' },
                    {
                        title: 'Proposta da',
                        key: 'autore',
                        width: 200,
                        render: (_, riga) => riga.author?.displayName ?? '-',
                    },
                    {
                        title: 'Il',
                        dataIndex: 'createdAt',
                        width: 140,
                        render: (quando: string | null) =>
                            quando === null ? '-' : new Date(quando).toLocaleDateString('it-IT'),
                    },
                    {
                        title: 'Stato',
                        dataIndex: 'status',
                        width: 130,
                        render: (stato: string) => (
                            <Tag
                                color={
                                    stato === 'pending'
                                        ? 'gold'
                                        : stato === 'published'
                                          ? 'green'
                                          : 'red'
                                }
                            >
                                {stato}
                            </Tag>
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 140,
                        render: (_, riga) => (
                            <Button
                                size="small"
                                type="primary"
                                // Approvare e rifiutare valgono solo su una
                                // proposta ancora in attesa: il server
                                // risponde 422 su tutto il resto, e offrire
                                // il bottone lo farebbe scoprire dopo.
                                disabled={riga.status !== 'pending'}
                                onClick={() => {
                                    setInRevisione(riga);
                                    setAperto(true);
                                }}
                            >
                                Revisiona
                            </Button>
                        ),
                    },
                ]}
            />

            <ReviewDrawer
                proposta={inRevisione}
                aperto={aperto}
                onChiudi={() => setAperto(false)}
            />
        </>
    );
};
```

- [ ] **Step 11: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test && npm run build
git add package.json package-lock.json resources/js/admin/domain/changes.ts resources/js/admin/domain/changes.test.ts resources/js/admin/pages/ReviewDrawer.tsx resources/js/admin/pages/ReviewDrawer.test.tsx resources/js/admin/pages/SubmissionsPage.tsx
git commit -m "$(cat <<'PLAN_EOF'
feat(admin): the review queue

The one screen in the panel that shows who proposed what, and the second of the
two component tests the spec names: reviewing with corrections.

Approving sends only the fields that changed. `approve` writes what it
receives, so sending the untouched ones too would push the name back through
the `name_norm` uniqueness check on a row nobody renamed. `changedFields`
compares scalars, which is all these forms produce - the comma-separated
columns are reduced to a string by joinCsv before they get there.

The rejection note is required here and optional on the server. It is the only
trace of why, and the day the author is finally told - the spec says nothing
shows it to them yet - an empty note would tell them nothing.

Author and date filter on the client, and the comment says why: the server
knows type, status and q, and returns at most a hundred rows. On a hundred rows
already in hand a client-side filter is exactly as correct as a server-side
one, and if the queue ever passed a hundred the table would say so.

`fields` is read through three narrow readers rather than a cast. The server
may send null on any nullable column, and `as number` on a null would write
"null" into a numeric field with nothing objecting.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
PLAN_EOF
)"
```

---

### Task 10: Gli utenti

**Files:**
- Modify: `backend/resources/js/admin/pages/UsersPage.tsx`
- Test: `backend/resources/js/admin/pages/UsersPage.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `UserRow`, `PageHeader`.
- Produces: niente per gli altri task.

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/resources/js/admin/pages/UsersPage.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UsersPage } from '@admin/pages/UsersPage';

const UTENTI = {
    users: [
        {
            id: 3,
            handle: 'tizio',
            displayName: 'Tizio',
            email: 't@example.com',
            isAdmin: false,
            aiEnabled: true,
            createdAt: '2026-01-05T09:00:00+00:00',
            submitted: 4,
            published: 2,
        },
    ],
};

const monta = (): ReturnType<typeof vi.fn> => {
    const finta = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify(UTENTI), { status: 200 }));
    vi.stubGlobal('fetch', finta);

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <AntApp>
            <QueryClientProvider client={client}>
                <UsersPage />
            </QueryClientProvider>
        </AntApp>,
    );

    return finta;
};

describe('UsersPage', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=tok';
    });

    it('elenca gli iscritti con proposte fatte e approvate', async () => {
        monta();

        expect(await screen.findByText('tizio')).toBeDefined();
        expect(screen.getByText('2 su 4')).toBeDefined();
    });

    it('l\'interruttore IA manda una PATCH', async () => {
        const finta = monta();

        await userEvent.click(await screen.findByRole('switch'));

        await waitFor(() => {
            const chiamata = finta.mock.calls.find((c) => c[0] === '/api/admin/users/3');
            expect(chiamata?.[1].method).toBe('PATCH');
            expect(JSON.parse(chiamata?.[1].body)).toEqual({ aiEnabled: false });
        });
    });
});
```

- [ ] **Step 2: Lancia e verifica che fallisca**

```bash
npm test -- UsersPage
```

Atteso: FAIL, `Unable to find an element with the text: tizio`.

- [ ] **Step 3: Riscrivi `backend/resources/js/admin/pages/UsersPage.tsx`**

```tsx
import { useState } from 'react';
import { App, Alert, Button, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@admin/api/client';
import { ApiError, messageOf, toFormFields } from '@admin/api/errors';
import type { UserRow } from '@admin/api/types';
import { PageHeader } from '@admin/layout/PageHeader';

interface Risposta {
    users: UserRow[];
}

export const UsersPage = (): React.ReactElement => {
    const [inReset, setInReset] = useState<UserRow | null>(null);
    const [form] = Form.useForm<{ password: string }>();
    const client = useQueryClient();
    const { message } = App.useApp();

    const { data, isPending } = useQuery({
        queryKey: ['users'],
        queryFn: () => apiFetch<Risposta>('/api/admin/users').then((r) => r.users),
    });

    const interruttore = useMutation({
        mutationFn: ({ id, acceso }: { id: number; acceso: boolean }) =>
            apiFetch(`/api/admin/users/${id}`, { method: 'PATCH', body: { aiEnabled: acceso } }),
        onSuccess: async () => {
            await client.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (error: unknown) => {
            message.error(messageOf(error));
        },
    });

    const reimposta = async (valori: { password: string }): Promise<void> => {
        if (inReset === null) {
            return;
        }

        try {
            await apiFetch(`/api/admin/users/${inReset.id}/password`, {
                method: 'POST',
                body: valori,
            });
            message.success(`Password di ${inReset.handle} reimpostata. Ora diglielo.`);
            setInReset(null);
            form.resetFields();
        } catch (error) {
            if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
                form.setFields(toFormFields(error.errors));
            }

            message.error(messageOf(error));
        }
    };

    return (
        <>
            <PageHeader titolo="Utenti" sottotitolo="Gli iscritti e cosa hanno proposto." />

            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="L'interruttore IA e' un cartello, non una serratura."
                description="Finche' le chiamate a Gemini partono dal telefono con la chiave nel bundle, spegnerlo nasconde il microfono e nient'altro. Serve a regalare l'AI a chi si vuole; diventa un diritto vero quando le chiamate passeranno da qui."
            />

            <Table<UserRow>
                rowKey="id"
                loading={isPending}
                dataSource={data ?? []}
                pagination={false}
                columns={[
                    {
                        title: 'Handle',
                        dataIndex: 'handle',
                        render: (handle: string, riga) => (
                            <Space>
                                <Typography.Text strong>{handle}</Typography.Text>
                                {riga.isAdmin && <Tag color="blue">admin</Tag>}
                            </Space>
                        ),
                    },
                    { title: 'Nome', dataIndex: 'displayName' },
                    { title: 'Email', dataIndex: 'email' },
                    {
                        title: 'Iscritto il',
                        dataIndex: 'createdAt',
                        width: 130,
                        render: (quando: string | null) =>
                            quando === null ? '-' : new Date(quando).toLocaleDateString('it-IT'),
                    },
                    {
                        title: 'Proposte approvate',
                        key: 'proposte',
                        width: 170,
                        /*
                         * Approvate su fatte, non due colonne: il numero che
                         * dice qualcosa e' il rapporto - quattro proposte e
                         * zero approvate e' un segnale, quattro e quattro un
                         * altro.
                         */
                        render: (_, riga) => `${riga.published} su ${riga.submitted}`,
                    },
                    {
                        title: 'IA',
                        dataIndex: 'aiEnabled',
                        width: 80,
                        render: (acceso: boolean, riga) => (
                            <Switch
                                checked={acceso}
                                loading={interruttore.isPending && interruttore.variables?.id === riga.id}
                                onChange={(prossimo) =>
                                    interruttore.mutate({ id: riga.id, acceso: prossimo })
                                }
                            />
                        ),
                    },
                    {
                        title: '',
                        key: 'azioni',
                        width: 180,
                        render: (_, riga) => (
                            <Button size="small" onClick={() => setInReset(riga)}>
                                Reimposta password
                            </Button>
                        ),
                    },
                ]}
            />

            <Modal
                open={inReset !== null}
                title={inReset === null ? '' : `Password di ${inReset.handle}`}
                okText="Reimposta"
                cancelText="Annulla"
                onOk={() => void form.submit()}
                onCancel={() => {
                    setInReset(null);
                    form.resetFields();
                }}
                destroyOnHidden
            >
                <Typography.Paragraph type="secondary">
                    Le sessioni aperte di questa persona cadono: una password si cambia anche perche&apos;
                    si teme che qualcuno la conosca.
                </Typography.Paragraph>
                <Form form={form} layout="vertical" onFinish={reimposta}>
                    <Form.Item
                        name="password"
                        label="Nuova password"
                        rules={[
                            { required: true, message: 'Serve una password.' },
                            { min: 8, message: 'Almeno otto caratteri, come alla registrazione.' },
                            { max: 72 },
                        ]}
                    >
                        <Input.Password autoComplete="new-password" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};
```

- [ ] **Step 4: Lancia e verifica che passi**

```bash
npm test -- UsersPage
```

Atteso: PASS, 2 test.

- [ ] **Step 5: Verifica i cancelli e committa**

```bash
npm run typecheck && npm test && npm run build
git add resources/js/admin/pages/UsersPage.tsx resources/js/admin/pages/UsersPage.test.tsx
git commit -m "$(cat <<'PLAN_EOF'
feat(admin): the users page

Handle, name, email, join date, what they proposed and the two switches: AI and
a password reset.

The proposals column is a ratio, not two numbers. Four proposed and zero
published says one thing, four and four says another, and side by side as raw
counts neither reads.

The AI switch carries the notice that it is a sign and not a lock, in the same
words the server's own controller uses: while Gemini is called from the phone
with the key in the bundle, turning it off hides the microphone and nothing
else. It exists to give the AI away to whoever should have it, and becomes a
right the day the calls go through the backend.

The reset dialog says the person's open sessions will drop, because they do -
the server deletes their tokens - and that is the reason a password gets
changed in the first place.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
PLAN_EOF
)"
```

---

### Task 11: I documenti e la prova dal vivo

Il pannello e' finito. Restano i documenti che oggi dicono che non esiste, e una prova che non sia vero solo in jest.

**Files:**
- Modify: `backend/README.md`
- Modify: `backend/CLAUDE.md`
- Modify: `TODO.md` (nella radice del repo)
- Modify: `.superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md`

**Interfaces:**
- Consumes: tutto. Non produce codice.

- [ ] **Step 1: Verifica che il server sia ancora verde**

Il pannello non ha toccato PHP, e questo comando lo dimostra invece di darlo per scontato.

```bash
php artisan test
```

Atteso: 251 test verdi.

- [ ] **Step 2: Prova dal vivo**

```bash
php artisan serve &
npm run dev
```

Apri `http://localhost:8000/admin` e verifica, uno per uno:

1. senza sessione compare il modulo di accesso;
2. con un utente **non** amministratore l'accesso viene rifiutato con "Le credenziali non sono corrette";
3. con l'amministratore si entra e la dashboard mostra i sei numeri;
4. "Vedi quali" sotto "Esercizi senza descrizione" apre Esercizi gia' filtrato, e la URL dice `?missing=instructions`;
5. si corregge un esercizio, si salva, e la riga in tabella cambia senza ricaricare;
6. si carica una foto su un esercizio e la miniatura compare in tabella;
7. una proposta si approva con una correzione al nome e sparisce dalla coda in attesa;
8. si ricarica la pagina su `/admin/utenti` e la pagina e' quella, non un 404 (il catch-all);
9. "Esci" riporta al modulo di accesso.

Ferma i due processi quando hai finito.

- [ ] **Step 3: Aggiorna `backend/README.md`**

Nella sezione che descrive il gestionale, sostituisci la frase che dice che il pannello non esiste ancora con:

```markdown
Il pannello vive in `resources/js/admin/`, e' servito da `GET /admin/{any?}` e
si costruisce con `npm run build` come ogni altro asset. Sette pagine: accesso,
dashboard, proposte, esercizi, alimenti, tassonomie, utenti.

L'accesso e' a **sessione** e non a token (`POST /admin/login`): un token per
una SPA va custodito nel browser, e cio' che sta in `localStorage` un XSS se lo
porta via. Le sue richieste a `/api/admin/*` passano con lo stesso cookie
perche' `statefulApi()` vale anche sulle rotte `/api/*`.

Tre cancelli, tutti da `backend/`: `npm run typecheck`, `npm test`,
`npm run build`.
```

- [ ] **Step 4: Aggiungi a `backend/CLAUDE.md`, in coda a § Convenzioni di codice**

```markdown
## Il pannello

`resources/js/admin/`. React 19 + Ant Design 5 + TanStack Query, TypeScript
strict, test con Vitest. Tre cose da non rompere:

- **Ogni richiesta passa da `apiFetch`.** Un `fetch` nudo non porta il token
  CSRF e torna 419; e' successo con l'upload di serie di AntD, che fa un
  `fetch` suo, ed e' il motivo per cui `PhotoUpload` usa `customRequest`.
- **Una PATCH manda solo cio' che e' cambiato.** I controller ammin fanno
  `array_key_exists` campo per campo apposta: mandare tutto vorrebbe dire
  azzerare le proteine mentre si corregge il sale, e in revisione far ripassare
  il nome dal controllo di unicita' per una voce che nessuno ha rinominato.
- **Gli errori 422 si vedono in due posti**: il `message` in un toast, gli
  `errors` sotto il campo. E' il contrario della regola dell'app (`CLAUDE.md`
  alla radice, § Convenzioni non negoziabili), e qui e' voluto: li' il toast e'
  l'unico posto perche' un telefono non ha spazio, qui il form ce l'ha.
```

- [ ] **Step 5: Aggiorna `TODO.md` § 5**

Nella tabella delle fasi del § 5, la riga della Fase 2 passa a fatta con la data (8 settembre 2026) e il rimando a questo piano. La riga della Fase 3 resta com'e'.

La prima voce del § 5 - le stringhe di `ExerciseFormSheet` e `FoodFormScreen` che promettono ancora che una voce "entra nell'elenco di chiunque abbia un account" - **resta aperta e va lasciata scritta**: e' falsa dalla Fase 1, e' lavoro della Fase 3, e questo task non la chiude. Cancellarla adesso vorrebbe dire perdere l'unica traccia di un debito che il codice non racconta.

- [ ] **Step 6: Riscrivi `.superpowers/sdd/2026-09-07-gestionale-fase-1-server/RIPRENDI-QUI.md`**

Sostituiscilo per intero. Deve dire, in quest'ordine:

1. **Dove siamo**: Fase 1 e Fase 2 complete. Il pannello vive su `/admin`, sette pagine, accesso a sessione. Riporta il conteggio vero dei test - quello di `php artisan test` e quello di `npm test` - letti dall'output, non a memoria.
2. **Cosa c'e' nel pannello**: le sette pagine in una riga ciascuna, e i tre cancelli (`npm run typecheck`, `npm test`, `npm run build`, da `backend/`).
3. **Il debito piu' visibile**: le due stringhe dell'app, ancora false. Stessa voce di prima, non risolta.
4. **Cosa manca**: la sola Fase 3, con la sua stima, presa dalla tabella che c'e' gia'.
5. **Il testo da incollare**: il messaggio con cui aprire la sessione della Fase 3, sullo stampo di quello che ha aperto questa - il percorso di questo file, quello della spec, e l'istruzione di scrivere il piano con `writing-plans` e di eseguirlo con `subagent-driven-development`.

- [ ] **Step 7: Commit**

```bash
git add ../TODO.md ../.superpowers README.md CLAUDE.md
git commit -m "$(cat <<'PLAN_EOF'
docs: the panel exists now, and the docs say so

backend/README.md described a panel that did not exist; it now describes the
one that does, including why its login is a session and not a token.

backend/CLAUDE.md gains three rules that cost something to learn: every request
goes through apiFetch (a bare fetch carries no CSRF token and comes back 419,
which is what AntD's built-in upload did), a PATCH sends only what changed, and
422 errors show in two places here - the opposite of the app's rule, on purpose,
because a form has room where a phone toast does not.

TODO.md marks phase 2 done and leaves phase 1's open item open: the two strings
in ExerciseFormSheet and FoodFormScreen still promise that what you create
"enters everyone's list", which stopped being true with the server phase. That
is phase 3 work and this did not touch it.

Claude-Session: https://claude.ai/code/session_01FtjAgUzkddsvkAQAcWkWJr
PLAN_EOF
)"
```

---

## Cosa resta fuori, dichiarato

- **La Fase 3, cioe' l'app**: `catalogSync.ts`, le migrazioni 019 e 020, `catalog_uid`, le tassonomie dinamiche e le due stringhe che promettono ancora la pubblicazione immediata. La spec le elenca in § Cosa cambia nell'app esistente.
- **Il pannello non e' bilingue.** Lo usa una persona sola e parla italiano. `Accept-Language` resta quel che manda l'app.
- **Nessuna riorganizzazione delle voci di catalogo in blocco** (approvare dieci proposte insieme, correggere un gruppo muscolare su cento esercizi): non e' richiesta, e con la coda che si conta sulle dita non serve.
- **Nessun tema scuro.** AntD ne ha uno pronto e si accende con una riga il giorno che qualcuno lo chiede.
