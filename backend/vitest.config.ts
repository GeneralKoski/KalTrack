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
        // jsdom parte da "http://localhost/": `router.tsx` crea il
        // `createBrowserRouter` con `basename: '/admin'` all'import, e un
        // router con basename non rende niente su un URL che non ci parte
        // sotto. In produzione il browser e' gia' su `/admin/...`; qui va
        // detto esplicitamente.
        environmentOptions: {
            jsdom: { url: 'http://localhost/admin' },
        },
        setupFiles: ['./vitest.setup.ts'],
        include: ['resources/js/admin/**/*.test.{ts,tsx}'],
        restoreMocks: true,
        // `vi.stubGlobal('fetch', ...)` sopravvive al test che lo ha scritto
        // senza questa riga: il test dopo eredita le risposte finte del test
        // prima, e passa o fallisce per un motivo che non e' il suo.
        unstubGlobals: true,
    },
});
