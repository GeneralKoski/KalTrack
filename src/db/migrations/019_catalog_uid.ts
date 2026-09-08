import type { Migration } from "@/src/db/migrations/types";

/**
 * L'identita' stabile di una voce di catalogo.
 *
 * Fin qui l'app riconosceva una voce dal nome normalizzato, che e' la stessa
 * chiave con cui il server tiene fuori i doppioni. Regge finche' nessuno
 * rinomina: da quando il pannello di amministrazione permette di correggere
 * il nome di una proposta mentre la si approva, la voce rinominata arriva sul
 * telefono come una voce nuova e quella col nome vecchio resta. Una rinomina,
 * un doppione per telefono.
 *
 * `uid` non e' un autoincrement del server e per questo puo' stare in una
 * colonna che si sincronizza: e' una stringa stabile assegnata alla voce, il
 * server e' uno solo, e la stessa voce ha lo stesso uid per chiunque. Un uid
 * che dall'altra parte non esiste non risolve e basta, e la ricaduta sul nome
 * lo ripesca.
 */
export const migration019: Migration = {
  version: 19,
  name: "catalog_uid",
  up: `
ALTER TABLE exercises ADD COLUMN catalog_uid TEXT;
ALTER TABLE foods ADD COLUMN catalog_uid TEXT;
CREATE INDEX idx_exercises_catalog_uid ON exercises (catalog_uid);
CREATE INDEX idx_foods_catalog_uid ON foods (catalog_uid);
`,
};
