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
  type CatalogExerciseFields,
} from "@/src/db/queries/exercises";
import {
  applyCatalogFood,
  createFood,
  detachFoodFromCatalog,
  findFoodByCatalogUid,
  findFoodByName,
  setFoodCatalogUid,
  type CatalogFoodFields,
} from "@/src/db/queries/foods";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { catalogPhotoPath } from "@/src/services/photoSync";
import {
  CATALOG_EXERCISES_CURSOR,
  CATALOG_FOODS_CURSOR,
  CATALOG_PULLED_AT,
} from "@/src/services/syncMarkers";
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
 * La riga si cerca per uid e, non trovata, per nome - ma il nome vale solo su
 * una riga che l'uid non ce l'ha ancora: una riga con un uid GIA' diverso e'
 * l'identita' di un'altra voce, e agganciarla scambierebbe silenziosamente
 * contenuto e identita' invece di lasciarla alla voce che gliel'ha data.
 *
 * Un TOMBSTONE si cerca solo per uid, e non e' una dimenticanza: di una voce
 * cancellata il server manda solo `uid` e `deletedAt`, quindi un nome non c'e'
 * da confrontare. Non lascia scoperto niente, perche' i tombstone escono solo
 * in un pull incrementale - il primo pull, quello che distribuisce gli uid,
 * non ne contiene nessuno.
 */
async function applyExercise(voce: catalog.CatalogExercise): Promise<boolean> {
  const perUid = await findExerciseByCatalogUid(voce.uid);

  // `!= null` e non `!== null`: il campo e' sempre presente su un tombstone
  // vero, ma un `undefined` sfuggito da un payload malformato deve finire
  // qui e non in fondo alla funzione, dove proverebbe a leggere un nome che
  // un tombstone non manda mai.
  if (voce.deletedAt != null) {
    if (!perUid || perUid.is_custom === 1) return false;
    await detachExerciseFromCatalog(perUid.id);
    return true;
  }

  if (!voce.name || !voce.muscleGroup || !isMuscleGroup(voce.muscleGroup)) {
    return false;
  }

  /*
   * Il fallback per nome vale SOLO per una riga che l'uid non ce l'ha ancora
   * ("le righe gia' installate che l'uid non ce l'hanno ancora", vedi il
   * commento in cima al file). Una riga che ha gia' un uid DIVERSO e' l'
   * identita' di un'altra voce di catalogo: agganciarla per nome le
   * scambierebbe silenziosamente contenuto e identita' - il caso e' una
   * voce X rinominata (che libera il nome) e una voce Y che nel frattempo
   * prende quel nome. Trattarla come "non trovata" lascia inserire Y come
   * riga nuova, e X resta la sua riga con il suo uid: due righe che
   * condividono per un giro un nome e' corretto, perche' il prossimo pull di
   * X la rinomina di nuovo.
   */
  const perNome = perUid ? null : await findExerciseByName(voce.name);
  const esistente =
    perUid ?? (perNome?.catalog_uid === null ? perNome : null);

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
    /*
     * `satisfies` e non `:` - un'annotazione di tipo allargherebbe
     * `muscleGroup` a `string` (il confine di `applyCatalogExercise`, che
     * scrive anche righe di cui SQLite non sa nulla di enum) e quella
     * stringa larga non basterebbe piu' a `createExercise`, che vuole
     * `MuscleGroup`. `satisfies` tiene il tipo letterale stretto E riattiva
     * il controllo delle proprieta' in eccesso: senza, un campo estraneo come
     * `notes` si infilerebbe qui dentro zitto, e sarebbe scritto sull'insert
     * - esattamente il giudizio personale che la regola 2 vieta.
     */
  } satisfies CatalogExerciseFields;

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

/**
 * L'esito di un giro: quante righe ha toccato, e se e' davvero arrivato al
 * server.
 *
 * `pullExercises`/`pullFoods` (sotto) tornavano `0` sia a "niente da fare" sia
 * a "e' andato tutto storto": `syncCatalog` non poteva distinguere un giro
 * riuscito ma vuoto da un giro fallito, e quindi non poteva decidere quando
 * scrivere il segnaposto della finestra. `riuscito` e' esattamente quella
 * distinzione.
 */
type EsitoGiro = { toccate: number; riuscito: boolean };

/**
 * Il catalogo degli esercizi, dal cursore in poi. Non solleva.
 *
 * Interno: la funzione pubblica `pullExercises` (sotto) e' rimasta con la sua
 * firma di sempre - i test dei task 6 e 7 la chiamano una quarantina di volte
 * aspettandosi un numero - e questa e' quella che serve a `syncCatalog` per
 * sapere se il giro e' davvero arrivato al server.
 */
async function giroEsercizi(): Promise<EsitoGiro> {
  try {
    if (!attivo()) return { toccate: 0, riuscito: false };

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
    return { toccate, riuscito: true };
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] esercizi non aggiornati", error);
    }
    return { toccate: 0, riuscito: false };
  }
}

/** Il catalogo degli esercizi, dal cursore in poi. Non solleva. */
export async function pullExercises(): Promise<number> {
  return (await giroEsercizi()).toccate;
}

/**
 * Una voce di catalogo alimentare applicata alla riga locale.
 *
 * Il marcatore di proprieta' qui e' `source` e non `is_custom`, che gli
 * alimenti non hanno: `source = 'seed'` e' una riga del catalogo, tutto il
 * resto e' dell'utente. Non e' un ripiego - `source = 'seed'` sono esattamente
 * le righe che `catalog:seed` ha pubblicato sul server sotto i loro id
 * parlanti, e `searchMyFoods` filtra gia' `source != 'seed'`.
 */
async function applyFood(voce: catalog.CatalogFood): Promise<boolean> {
  const perUid = await findFoodByCatalogUid(voce.uid);

  // `!= null` e non `!== null`: un campo assente non deve passare per un
  // tombstone, ed e' il perno della regola 3.
  if (voce.deletedAt != null) {
    if (!perUid || perUid.source !== "seed") return false;
    await detachFoodFromCatalog(perUid.id);
    return true;
  }

  if (!voce.name || voce.kcal == null) return false;

  /*
   * La ricaduta sul nome vale SOLO per una riga che non ha ancora un uid.
   *
   * Una riga che ne porta gia' uno diverso non e' questa voce, e' un'altra:
   * il pannello rinomina la voce X liberandone il nome, una voce Y nuova lo
   * prende, e la stessa pagina le porta entrambe. Accettando il match per
   * nome, la riga di X si ritroverebbe riscritta con l'uid e il contenuto di
   * Y - X orfana, e una riga che le ricette nominano diventata un altro
   * alimento. Due righe che per un giro condividono il nome sono la
   * soluzione, non il problema: l'altra voce si rinomina da se' al proprio
   * aggiornamento.
   */
  const perNome = perUid ? null : await findFoodByName(voce.name);
  const esistente =
    perUid ?? (perNome?.catalog_uid === null ? perNome : null);

  /*
   * `satisfies` e non un'annotazione: annotare allargherebbe i campi al tipo
   * dichiarato e il controllo delle proprieta' in eccesso sparirebbe, cioe'
   * la regola 2 smetterebbe di essere un errore del compilatore sul ramo di
   * inserimento. Con `satisfies` il tipo resta quello inferito E un campo di
   * troppo non compila.
   */
  const campi = {
    name: voce.name,
    brand: voce.brand ?? null,
    nutrients: {
      ...EMPTY_NUTRIENTS,
      kcal: voce.kcal,
      protein: voce.protein ?? 0,
      carbs: voce.carbs ?? 0,
      sugars: voce.sugars ?? 0,
      fat: voce.fat ?? 0,
      saturatedFat: voce.saturatedFat ?? 0,
      fiber: voce.fiber ?? 0,
      salt: voce.salt ?? 0,
    },
    isLiquid: voce.isLiquid ?? false,
    defaultServingG: voce.defaultServingG ?? null,
    servingLabel: voce.servingLabel ?? null,
    // Come per gli esercizi: il percorso subito, i byte quando si guarda.
    imageUri: voce.image ? catalogPhotoPath(voce.image) : null,
  } satisfies CatalogFoodFields;

  if (!esistente) {
    /*
     * `barcode` e `off_id` NON sono in `campi`/`CatalogFoodFields`: sulla
     * riscrittura (`applyCatalogFood`) sono identita' che il catalogo non
     * tocca mai, la stessa regola di `updateFood`. Qui pero' e' un
     * INSERIMENTO, e la riga non esiste ancora: non c'e' niente da
     * proteggere, e ometterli lascerebbe arrivare un alimento di catalogo
     * senza codice a barre - la scansione successiva non lo troverebbe in
     * libreria e creerebbe un doppione da OpenFoodFacts (§ Il codice a barre
     * in CLAUDE.md).
     */
    await createFood({
      name: campi.name,
      brand: campi.brand,
      nutrients: campi.nutrients,
      isLiquid: campi.isLiquid,
      defaultServingG: campi.defaultServingG,
      servingLabel: campi.servingLabel,
      imageUri: campi.imageUri,
      barcode: voce.barcode ?? null,
      offId: voce.offId ?? null,
      source: "seed",
      catalogUid: voce.uid,
    });
    return true;
  }

  if (esistente.catalog_uid === null) {
    await setFoodCatalogUid(esistente.id, voce.uid);
  }

  /*
   * E' dell'utente: non si riscrive e non se ne affianca una copia.
   *
   * L'uid glielo si e' dato comunque, cosi' un tombstone futuro sa di quale
   * riga parla; ma i valori li ha corretti lui, e una seconda riga con lo
   * stesso nome in elenco sarebbe indistinguibile dalla prima.
   */
  if (esistente.source !== "seed") return false;

  await applyCatalogFood(esistente.id, voce.uid, campi);
  return true;
}

/**
 * Il catalogo degli alimenti, dal cursore in poi. Non solleva.
 *
 * Interno, come `giroEsercizi`: `pullFoods` (sotto) resta la firma che i test
 * dei task 6 e 7 gia' chiamano.
 */
async function giroAlimenti(): Promise<EsitoGiro> {
  try {
    if (!attivo()) return { toccate: 0, riuscito: false };

    let cursore = await readCursor(CATALOG_FOODS_CURSOR);
    let toccate = 0;

    for (let giro = 0; giro < MAX_PAGES; giro++) {
      const pagina = await catalog.fetchCatalogFoods(cursore);

      for (const voce of pagina.data) {
        if (await applyFood(voce)) toccate++;
      }

      if (pagina.cursor) await writeCursor(CATALOG_FOODS_CURSOR, pagina.cursor);
      if (!pagina.next) break;
      cursore = pagina.next;
    }

    if (toccate > 0) logger.info(`[catalogo] alimenti aggiornati: ${toccate}`);
    return { toccate, riuscito: true };
  } catch (error) {
    if (!alreadyLogged(error)) {
      logger.warn("[catalogo] alimenti non aggiornati", error);
    }
    return { toccate: 0, riuscito: false };
  }
}

/** Il catalogo degli alimenti, dal cursore in poi. Non solleva. */
export async function pullFoods(): Promise<number> {
  return (await giroAlimenti()).toccate;
}

/**
 * Sotto quest'ora dall'ultimo giro non se ne fa un altro.
 *
 * Il catalogo non e' il diario: e' anagrafica comune che cambia quando un
 * amministratore decide, non quando l'utente registra una serie. Un'ora e'
 * abbastanza spesso da far arrivare una correzione in giornata e abbastanza
 * raro da non pesare - e serve soprattutto al ritorno in primo piano, dove
 * senza finestra alternare due app avanti e indietro chiederebbe il catalogo
 * a ogni passaggio.
 */
export const CATALOG_WINDOW_MS = 60 * 60 * 1000;

/**
 * Vero se e' passata l'ora, o se non abbiamo mai fatto un giro.
 *
 * `Date.parse` e non un confronto fra stringhe: e' la regola 2 della
 * sincronizzazione, e vale anche qui. Un segnaposto illeggibile conta come
 * "mai fatto", che al massimo costa un giro in piu'.
 */
async function finestraScaduta(): Promise<boolean> {
  const stored = await getSetting(CATALOG_PULLED_AT);
  if (stored === null) return true;
  const ultimo = Date.parse(stored);
  if (Number.isNaN(ultimo)) return true;
  return Date.now() - ultimo >= CATALOG_WINDOW_MS;
}

/**
 * Il giro in corso, se c'e'.
 *
 * Senza questa guardia due giri sovrapposti duplicano una riga: `applyExercise`
 * legge e poi scrive attraverso un `await` (`findExerciseByCatalogUid` ->
 * `createExercise`), e `sqliteAdapter` serializza le query singole ma non
 * quella coppia. Il giro B puo' fare la sua lettura nel buco fra la lettura e
 * la scrittura del giro A, trovare `null` anche lui, e inserire la stessa voce
 * due volte - la rinomina-diventa-doppione che questa fase esiste per
 * chiudere, riaperta senza bisogno di nessuna rinomina.
 *
 * La guardia sta QUI e non nello scheduler, per la stessa ragione della
 * regola 6 della sincronizzazione (`sync.ts`): il catalogo ha tre inneschi -
 * avvio, ritorno in primo piano, bottone su due schermate - e mettere la
 * guardia in uno solo di loro lascia gli altri liberi di scavalcarla.
 *
 * Un secondo chiamante AGGANCIA lo stesso giro invece di ricevere uno zero
 * finto: il bottone deve raccontare l'esito del giro che sta davvero girando,
 * non "non c'era niente da fare" quando in realta' c'era, ed era gia' in
 * corso. Un `force` arrivato mentre un giro automatico e' in volo si aggancia
 * a quello: le richieste sono gia' partite.
 */
let giroInCorso: Promise<EsitoGiro> | null = null;

/**
 * Un giro di catalogo. Torna quante righe ha toccato in tutto, e se e'
 * davvero arrivato al server.
 *
 * `force` lo passa solo il bottone delle due schermate: chi lo tocca ha
 * appena chiesto il catalogo adesso, e fargli aspettare la finestra sarebbe un
 * comando che non fa niente.
 */
export async function syncCatalog(force = false): Promise<EsitoGiro> {
  if (giroInCorso) return giroInCorso;

  giroInCorso = eseguiGiroCatalogo(force);
  try {
    return await giroInCorso;
  } finally {
    giroInCorso = null;
  }
}

/**
 * I due pull sono in fila e non in `Promise.all`: `sqliteAdapter` serializza
 * comunque le query su un'unica connessione, quindi il parallelo non
 * guadagnerebbe niente e renderebbe illeggibile l'ordine dei log. Ognuno
 * incassa i propri errori, quindi il secondo parte anche se il primo e'
 * andato male.
 */
async function eseguiGiroCatalogo(force: boolean): Promise<EsitoGiro> {
  /*
   * La guardia sull'account sta QUI e non nei chiamanti, ed e' la lezione
   * della regola 6 della sincronizzazione: `runSync` ha pagato l'aver tenuto
   * la sua nello scheduler mentre altri due chiamanti la scavalcavano.
   *
   * Un giro senza account non e' arrivato da nessuna parte: `riuscito: false`
   * e nessun segnaposto scritto, o il primo pull vero dopo l'accesso
   * aspetterebbe un'ora invece di partire subito.
   */
  if (!attivo()) return { toccate: 0, riuscito: false };
  if (!force && !(await finestraScaduta())) return { toccate: 0, riuscito: true };

  const esercizi = await giroEsercizi();
  const alimenti = await giroAlimenti();
  const riuscito = esercizi.riuscito && alimenti.riuscito;

  /*
   * Il segnaposto si scrive SOLO quando entrambi i pull sono arrivati al
   * server, mai su un giro parziale o totalmente fallito.
   *
   * Scriverlo comunque - come faceva la prima versione - vuol dire che "ho
   * chiesto" e "ho avuto risposta" diventano lo stesso evento: un telefono in
   * galleria alle 10:00 fallisce, scrive comunque le 10:00, la rete torna alle
   * 10:02 e la finestra tiene il catalogo muto fino alle 11:00 anche con
   * connessione perfetta. Un giro fallito merita un altro tentativo al
   * prossimo innesco utile, non un'ora di silenzio: il cursore rende quel
   * tentativo una richiesta breve, non un pull da capo.
   */
  if (riuscito) {
    await setSetting(CATALOG_PULLED_AT, new Date().toISOString());
  }

  return { toccate: esercizi.toccate + alimenti.toccate, riuscito };
}
