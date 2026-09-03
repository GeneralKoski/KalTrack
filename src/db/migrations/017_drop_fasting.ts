import type { Migration } from "@/src/db/migrations/types";

/**
 * La feature digiuno e' stata tolta dall'app: la schermata, le query e le
 * chiavi i18n sono sparite dal codice, e la tabella non deve restare a farsi
 * viaggiare da `sync.ts`/`backup.ts` senza che nessuno la legga piu'.
 */
export const migration017: Migration = {
  version: 17,
  name: "drop_fasting",
  up: `
DROP TABLE IF EXISTS fasting_windows;
`,
};
