import * as catalog from "@/src/api/catalog";
import { hasBackend } from "@/src/api/config";
import { alreadyLogged } from "@/src/api/errors";
import {
  applyCatalogExercise,
  createExercise,
  detachExerciseFromCatalog,
  findExerciseByCatalogUid,
  findExerciseByName,
  setExerciseCatalogUid,
} from "@/src/db/queries/exercises";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { catalogPhotoPath } from "@/src/services/photoSync";
import { CATALOG_EXERCISES_CURSOR } from "@/src/services/syncMarkers";
import { useAccountStore } from "@/src/stores/accountStore";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleGroup,
} from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

/**
 * Il catalogo comune, portato nel telefono.
 *
 * Sostituisce `exerciseCatalog.ts` e `foodCatalog.ts`, che leggevano tutto il
 * catalogo a ogni giro e inserivano soltanto quel che mancava. La differenza
 * non e' il traffico: quel modo non poteva aggiornare una riga che il telefono
 * aveva gia', quindi una descrizione corretta dal gestionale non arrivava a
 * nessuno, e una voce rinominata arrivava come voce nuova lasciando in casa
 * quella col nome vecchio.
 *
 * TRE REGOLE, e ognuna e' un difetto pagato o evitato.
 *
 * 1. L'IDENTITA' E' `catalog_uid`. Il nome normalizzato e' la ricaduta di un
 *    giro solo, per le righe gia' installate che l'uid non ce l'hanno ancora:
 *    agganciata per nome, la riga riceve l'uid e dal giro dopo si aggancia per
 *    quello.
 * 2. IL CATALOGO SCRIVE SOLO I CAMPI DI CATALOGO, E SOLO SULLE RIGHE CHE SONO
 *    SUE. `is_custom = 1` non si tocca mai. `notes`, `dislike_level`,
 *    `is_banned` e `usage_count` non si toccano su nessuna riga: sono giudizi
 *    su un esercizio e storia di come lo si usa, non la sua descrizione.
 * 3. UNA VOCE TOLTA DAL CATALOGO NON SI CANCELLA, CAMBIA PADRONE. Cancellarla
 *    porterebbe via il nome a ogni allenamento passato che la nominava.
 *
 * Niente qui solleva verso una schermata: il telefono e' la fonte di verita',
 * e senza rete l'app funziona identica.
 */

/**
 * Quante pagine al massimo in un giro.
 *
 * Non e' una stima del catalogo: e' un tetto contro un ciclo che non finisce.
 * Un server che tornasse una pagina piena col cursore fermo terrebbe questo
 * ciclo dentro per sempre, e qui non c'e' nessuno che possa fermarlo.
 */
const MAX_PAGES = 50;

const attivo = (): boolean =>
  hasBackend() && useAccountStore.getState().token !== null;

/**
 * Il cursore salvato, o `undefined` per ripartire da zero.
 *
 * Un valore illeggibile - scritto da una versione precedente, o corrotto - non
 * e' un errore da propagare: riparte dall'inizio, che al massimo costa un pull
 * completo. Il pull e' idempotente, quindi non c'e' niente da riparare.
 */
async function readCursor(
  key: string,
): Promise<catalog.CatalogCursor | undefined> {
  const stored = await getSetting(key);
  if (stored === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as catalog.CatalogCursor).since === "string" &&
      typeof (parsed as catalog.CatalogCursor).afterId === "number"
    ) {
      return parsed as catalog.CatalogCursor;
    }
  } catch {
    // Vedi sopra: si riparte da zero.
  }
  return undefined;
}

const writeCursor = (key: string, cursore: catalog.CatalogCursor) =>
  setSetting(key, JSON.stringify(cursore));

/**
 * Gli slug che questa versione dell'app conosce.
 *
 * Il metro sono ancora le costanti di `src/types/gym.ts`; dal task 12 sara' la
 * tassonomia locale, cioe' quel che il server dichiara. Il controllo non
 * sparisce, cambia fonte: quel che non si conosce si butta invece di entrare
 * in colonna e girare per l'app come se fosse buono.
 */
const isMuscleGroup = (value: string): value is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(value);

const parseMuscles = (value: string | null | undefined): MuscleGroup[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(isMuscleGroup);

const parseEquipment = (value: string | null | undefined): Equipment[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is Equipment => (EQUIPMENT as readonly string[]).includes(v));

/**
 * Una voce di catalogo applicata alla riga locale. Torna true se ha toccato
 * qualcosa.
 *
 * La riga si cerca per uid e, non trovata, per nome. Un TOMBSTONE si cerca
 * solo per uid, e non e' una dimenticanza: di una voce cancellata il server
 * manda solo `uid` e `deletedAt`, quindi un nome non c'e' da confrontare. Non
 * lascia scoperto niente, perche' i tombstone escono solo in un pull
 * incrementale - il primo pull, quello che distribuisce gli uid, non ne
 * contiene nessuno.
 */
async function applyExercise(voce: catalog.CatalogExercise): Promise<boolean> {
  const perUid = await findExerciseByCatalogUid(voce.uid);

  if (voce.deletedAt !== null) {
    if (!perUid || perUid.is_custom === 1) return false;
    await detachExerciseFromCatalog(perUid.id);
    return true;
  }

  if (!voce.name || !voce.muscleGroup || !isMuscleGroup(voce.muscleGroup)) {
    return false;
  }

  const esistente = perUid ?? (await findExerciseByName(voce.name));

  const campi = {
    name: voce.name,
    muscleGroup: voce.muscleGroup,
    secondaryMuscles: parseMuscles(voce.secondaryMuscles),
    equipment: parseEquipment(voce.equipment),
    instructions: voce.instructions ?? null,
    /*
     * Il PERCORSO si scrive subito, i byte arrivano dopo.
     *
     * `SyncedPhoto` scarica quel che non c'e' e nel frattempo disegna un
     * segnaposto: cosi' il pull non tiene ferma la palestra per scaricare
     * duecento immagini al primo avvio, e la foto compare quando si guarda
     * quell'esercizio.
     */
    photoUri: voce.photo ? catalogPhotoPath(voce.photo) : null,
  };

  if (!esistente) {
    await createExercise({ ...campi, isCustom: false, catalogUid: voce.uid });
    return true;
  }

  // Agganciata per nome: da qui in poi si aggancia per uid, e una rinomina
  // dal pannello la aggiorna invece di duplicarla.
  if (esistente.catalog_uid === null) {
    await setExerciseCatalogUid(esistente.id, voce.uid);
  }

  // Regola 2: e' roba dell'utente. L'uid glielo si e' dato comunque, cosi' un
  // tombstone futuro sa di quale riga parla.
  if (esistente.is_custom === 1) return false;

  await applyCatalogExercise(esistente.id, voce.uid, campi);
  return true;
}

/** Il catalogo degli esercizi, dal cursore in poi. Non solleva. */
export async function pullExercises(): Promise<number> {
  try {
    if (!attivo()) return 0;

    let cursore = await readCursor(CATALOG_EXERCISES_CURSOR);
    let toccate = 0;

    for (let giro = 0; giro < MAX_PAGES; giro++) {
      const pagina = await catalog.fetchCatalogExercises(cursore);

      for (const voce of pagina.data) {
        if (await applyExercise(voce)) toccate++;
      }

      /*
       * Si salva `cursor` e non `next`: il primo dice dove siamo arrivati, il
       * secondo se c'e' altro. Salvando `next`, l'ultima pagina - che non e'
       * mai piena - non avanzava il segnaposto, e la coda del catalogo si
       * rileggeva a ogni giro in silenzio.
       *
       * Si salva a ogni pagina e non alla fine: un giro interrotto a meta'
       * riprende da dove era, invece di rifare tutto.
       */
      if (pagina.cursor) await writeCursor(CATALOG_EXERCISES_CURSOR, pagina.cursor);
      if (!pagina.next) break;
      cursore = pagina.next;
    }

    if (toccate > 0) logger.info(`[catalogo] esercizi aggiornati: ${toccate}`);
    return toccate;
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizi non aggiornati", error);
    }
    return 0;
  }
}

/** Un giro di catalogo. Torna quante righe ha toccato in tutto. */
export async function syncCatalog(): Promise<number> {
  return pullExercises();
}
