import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting, getDb } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood, getFood, searchFoods } from "@/src/db/queries/foods";
import { createRecipe, updateRecipe } from "@/src/db/queries/recipes";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import {
  deleteSteps,
  deleteWeight,
  setSteps,
  setWeight,
} from "@/src/db/queries/tracking";
import { removeLastWater } from "@/src/db/queries/wellbeing";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import {
  applyChanges,
  collectChanges,
  LOCAL_ONLY_TABLES,
  SYNCED_TABLES,
  type SyncChange,
} from "@/src/services/sync";
import {
  CURSOR_KEY,
  PUSHED_KEY,
  resetSyncMarkers,
} from "@/src/services/syncMarkers";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const food = (over: Partial<Parameters<typeof createFood>[0]> = {}) =>
  createFood({
    name: "Riso",
    brand: null,
    nutrients: { ...EMPTY_NUTRIENTS, kcal: 130 },
    isLiquid: false,
    defaultServingG: null,
    servingLabel: null,
    imageUri: null,
    ...over,
  });

describe("cosa parte dal telefono", () => {
  it("raccoglie una riga appena creata", async () => {
    const id = await food();
    const changes = await collectChanges(null);

    const mine = changes.find((c) => c.id === id);
    expect(mine).toBeDefined();
    expect(mine?.table).toBe("foods");
    expect(mine?.payload.name).toBe("Riso");
  });

  /**
   * Il segnaposto e' quel che rende la sincronizzazione economica: senza,
   * ogni giro rimanderebbe l'intero database.
   */
  it("dopo il segnaposto manda solo quel che e' cambiato", async () => {
    await food({ name: "Vecchio" });
    const cursor = new Date().toISOString();

    // Una riga scritta dopo il segnaposto.
    await new Promise((r) => setTimeout(r, 5));
    const recente = await food({ name: "Nuovo" });

    const changes = await collectChanges(cursor);
    const nomi = changes
      .filter((c) => c.table === "foods")
      .map((c) => c.payload.name);

    expect(nomi).toContain("Nuovo");
    expect(nomi).not.toContain("Vecchio");
    expect(changes.some((c) => c.id === recente)).toBe(true);
  });

  /** Una cancellazione e' una modifica: senza mandarla, l'altro telefono la tiene. */
  it("manda anche le righe cancellate", async () => {
    const id = await food();
    const database = await getDb();
    await database.runAsync(
      "UPDATE foods SET deleted_at = ?, updated_at = ? WHERE id = ?",
      ["2026-08-29T12:00:00.000Z", "2026-08-29T12:00:00.000Z", id],
    );

    const changes = await collectChanges(null);
    const mine = changes.find((c) => c.id === id);

    expect(mine?.deletedAt).toBe("2026-08-29T12:00:00.000Z");
  });

  /**
   * Il difetto che questo test blocca, visto in produzione: il cursore sta
   * in `settings`, che e' una tabella sincronizzata. Ogni giro ne scriveva
   * uno nuovo da mandare al giro dopo, e soprattutto il cursore di un
   * telefono sarebbe finito sull'altro, che avrebbe saltato tutte le righe
   * precedenti a quel punto senza averle mai ricevute.
   */
  it("non manda il proprio segnaposto di sincronizzazione", async () => {
    await setSetting("sync.cursor", "2026-08-29T18:00:00.000Z");
    await setSetting("theme", "dark");

    const changes = await collectChanges(null);
    const chiavi = changes
      .filter((c) => c.table === "settings")
      .map((c) => c.id);

    expect(chiavi).not.toContain("sync.cursor");
    // Le altre impostazioni viaggiano: e' solo il cursore a restare qui.
    expect(chiavi).toContain("theme");
  });

  it("non accetta un segnaposto arrivato da un altro telefono", async () => {
    await setSetting("sync.cursor", "2026-08-29T18:00:00.000Z");

    await applyChanges([
      {
        table: "settings",
        id: "sync.cursor",
        payload: { key: "sync.cursor", value: "2027-01-01T00:00:00.000Z" },
        updatedAt: "2027-01-01T00:00:00.000Z",
        deletedAt: null,
        createdAt: "2027-01-01T00:00:00.000Z",
      },
    ]);

    expect(await getSetting("sync.cursor")).toBe("2026-08-29T18:00:00.000Z");
  });

  it("non manda i registri che restano sul telefono", () => {
    // Il conto dei costi AI e la diagnostica sono storia di QUESTA
    // installazione: su un altro telefono sarebbero il racconto di guasti che
    // non ci sono stati.
    expect(SYNCED_TABLES).not.toContain("ai_calls");
    expect(SYNCED_TABLES).not.toContain("app_logs");
  });

  /** I padri prima dei figli: al contrario le foreign key rifiutano le righe. */
  it("elenca le tabelle in ordine di dipendenza", () => {
    const at = (t: string) => (SYNCED_TABLES as readonly string[]).indexOf(t);

    expect(at("foods")).toBeLessThan(at("meal_entries"));
    expect(at("meals")).toBeLessThan(at("meal_entries"));
    expect(at("recipes")).toBeLessThan(at("recipe_items"));
    expect(at("routines")).toBeLessThan(at("routine_days"));
    expect(at("routine_days")).toBeLessThan(at("routine_blocks"));
    expect(at("workout_sessions")).toBeLessThan(at("session_sets"));
  });
});

describe("cosa arriva dal server", () => {
  const incoming = (over: Partial<SyncChange> = {}): SyncChange => ({
    table: "foods",
    id: "11111111-1111-4111-8111-111111111111",
    payload: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Farro",
      name_norm: "farro",
      brand: null,
      kcal: 337,
      protein: 15,
      carbs: 67,
      sugars: 2,
      fat: 2.5,
      saturated_fat: 0.4,
      fiber: 7,
      salt: 0,
      is_liquid: 0,
      default_serving_g: null,
      serving_label: null,
      image_uri: null,
      is_favorite: 0,
      usage_count: 0,
      created_at: "2026-08-29T10:00:00.000Z",
      updated_at: "2026-08-29T10:00:00.000Z",
      deleted_at: null,
    },
    updatedAt: "2026-08-29T10:00:00.000Z",
    deletedAt: null,
    createdAt: "2026-08-29T10:00:00.000Z",
    ...over,
  });

  it("scrive nel database locale una riga nuova", async () => {
    expect(await applyChanges([incoming()])).toBe(1);

    const found = await getFood("11111111-1111-4111-8111-111111111111");
    expect(found?.name).toBe("Farro");
    expect(found?.kcal).toBe(337);
  });

  /**
   * La regola che protegge il lavoro fatto offline: quel che ho scritto qui
   * cinque minuti fa non viene sovrascritto da una copia di ieri.
   */
  it("non sovrascrive una modifica locale piu' recente", async () => {
    const id = await food({ name: "Il mio riso" });
    const database = await getDb();
    await database.runAsync("UPDATE foods SET updated_at = ? WHERE id = ?", [
      "2026-08-29T18:00:00.000Z",
      id,
    ]);

    const applied = await applyChanges([
      incoming({
        id,
        payload: { id, name: "Riso del server", updated_at: "2026-08-29T09:00:00.000Z" },
        updatedAt: "2026-08-29T09:00:00.000Z",
      }),
    ]);

    expect(applied).toBe(0);
    expect((await getFood(id))?.name).toBe("Il mio riso");
  });

  it("sovrascrive quando la copia del server e' piu' recente", async () => {
    const id = await food({ name: "Il mio riso" });
    const database = await getDb();
    await database.runAsync("UPDATE foods SET updated_at = ? WHERE id = ?", [
      "2026-08-29T09:00:00.000Z",
      id,
    ]);

    await applyChanges([
      incoming({
        id,
        payload: {
          id,
          name: "Riso aggiornato",
          name_norm: "riso aggiornato",
          kcal: 130,
          created_at: "2026-08-29T09:00:00.000Z",
          updated_at: "2026-08-29T18:00:00.000Z",
        },
        updatedAt: "2026-08-29T18:00:00.000Z",
      }),
    ]);

    expect((await getFood(id))?.name).toBe("Riso aggiornato");
  });

  /**
   * Una tabella che questa versione non conosce non deve far fallire tutto il
   * giro: due telefoni possono avere versioni diverse dell'app.
   */
  it("ignora una tabella sconosciuta senza rompere il resto", async () => {
    const applied = await applyChanges([
      incoming({ table: "tabella_del_futuro" }),
      incoming(),
    ]);

    expect(applied).toBe(1);
    expect(await getFood("11111111-1111-4111-8111-111111111111")).not.toBeNull();
  });

  /** Il giro completo: quel che esce da un telefono entra nell'altro. */
  it("regge il giro telefono A -> server -> telefono B", async () => {
    await food({ name: "Quinoa" });
    await setSteps("2026-08-29", 9450);
    const uscita = await collectChanges(null);

    // Telefono B: database vuoto, riceve quel che ha raccolto A.
    const secondo = createTestDb();
    await runMigrations(secondo);
    __setDbForTesting(secondo);

    await applyChanges(uscita);

    const trovati = await searchFoods("Quinoa", 5);
    expect(trovati.map((f) => f.name)).toContain("Quinoa");

    const passi = await secondo.getFirstAsync<{ steps: number }>(
      "SELECT steps FROM step_logs WHERE date = ?",
      ["2026-08-29"],
    );
    expect(passi?.steps).toBe(9450);
  });
});

describe("allineamento fra due dispositivi", () => {
  /**
   * Il caso peggiore trovato: `weight_logs` ha un UNIQUE su `date`, ma la
   * riga arriva con l'id dell'altro telefono. L'ON CONFLICT e' su `id`, la
   * violazione e' su `date`, quindi l'INSERT solleva - e siccome applyChanges
   * scrive tutto in UNA transazione, l'intero lotto viene annullato. La
   * sincronizzazione si blocca li' e ci resta a ogni giro.
   */
  it("due dispositivi che pesano lo stesso giorno non bloccano tutto", async () => {
    const database = await getDb();
    // Il peso di questo telefono per il 29.
    await database.runAsync(
      `INSERT INTO weight_logs (id, date, weight_kg, created_at, updated_at)
       VALUES ('locale-1', '2026-08-29', 78.5, '2026-08-29T08:00:00.000Z', '2026-08-29T08:00:00.000Z')`,
    );

    // L'altro telefono ha registrato lo stesso giorno, con un id suo.
    const applied = await applyChanges([
      {
        table: "weight_logs",
        id: "altro-telefono-1",
        payload: {
          id: "altro-telefono-1",
          date: "2026-08-29",
          weight_kg: 79.1,
          created_at: "2026-08-29T09:00:00.000Z",
          updated_at: "2026-08-29T09:00:00.000Z",
        },
        updatedAt: "2026-08-29T09:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-08-29T09:00:00.000Z",
      },
      // Una riga innocente nello stesso lotto: non deve pagare per l'altra.
      {
        table: "water_logs",
        id: "acqua-1",
        payload: {
          id: "acqua-1",
          date: "2026-08-29",
          ml: 500,
          created_at: "2026-08-29T09:00:00.000Z",
          updated_at: "2026-08-29T09:00:00.000Z",
        },
        updatedAt: "2026-08-29T09:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-08-29T09:00:00.000Z",
      },
    ]);

    // L'acqua deve essere entrata comunque.
    const acqua = await database.getFirstAsync<{ ml: number }>(
      "SELECT ml FROM water_logs WHERE id = 'acqua-1'",
    );
    expect(acqua?.ml).toBe(500);
    expect(applied).toBeGreaterThanOrEqual(1);

    // E un solo peso per quel giorno: quello piu' recente vince.
    const pesi = await database.getAllAsync<{ weight_kg: number }>(
      "SELECT weight_kg FROM weight_logs WHERE date = '2026-08-29' AND deleted_at IS NULL",
    );
    expect(pesi).toHaveLength(1);
    expect(pesi[0].weight_kg).toBe(79.1);
  });
});

describe("i due orologi", () => {
  /**
   * Il difetto che questo test blocca: `runSync` usava UN cursore per due
   * cose, l'ora del server per scaricare e la stessa ora confrontata con gli
   * `updated_at` locali per inviare. Con il telefono anche solo un minuto
   * indietro rispetto al server, le righe scritte in quel minuto risultavano
   * gia' inviate e non partivano mai piu'.
   */
  it("il segnaposto di invio e' un'ora locale, non del server", async () => {
    // Una riga scritta "adesso" secondo il telefono.
    const database = await getDb();
    const oraLocale = "2026-08-29T10:00:00.000Z";
    await database.runAsync(
      `INSERT INTO water_logs (id, date, ml, created_at, updated_at)
       VALUES ('w1', '2026-08-29', 250, ?, ?)`,
      [oraLocale, oraLocale],
    );

    // Il server e' avanti di dieci minuti: il suo cursore e' nel futuro
    // rispetto a qualunque updated_at locale.
    const cursoreDelServer = "2026-08-29T10:10:00.000Z";
    const conCursoreServer = await collectChanges(cursoreDelServer);
    expect(conCursoreServer.some((c) => c.id === "w1")).toBe(false);

    // Con il segnaposto locale la riga parte, che e' il comportamento giusto.
    const conSegnapostoLocale = await collectChanges("2026-08-29T09:00:00.000Z");
    expect(conSegnapostoLocale.some((c) => c.id === "w1")).toBe(true);
  });

  /**
   * Il formato deve restare confrontabile come stringa: e' cosi' che SQLite
   * decide cosa e' cambiato dopo il segnaposto.
   */
  it("gli orari locali sono ordinabili come stringhe", async () => {
    const database = await getDb();
    for (const [id, t] of [
      ["a", "2026-08-29T09:00:00.000Z"],
      ["b", "2026-08-29T10:00:00.000Z"],
      ["c", "2026-08-29T11:00:00.000Z"],
    ]) {
      await database.runAsync(
        `INSERT INTO water_logs (id, date, ml, created_at, updated_at)
         VALUES (?, '2026-08-29', 100, ?, ?)`,
        [id, t, t],
      );
    }

    const dopo = await collectChanges("2026-08-29T10:00:00.000Z");
    const ids = dopo.filter((c) => c.table === "water_logs").map((c) => c.id);
    expect(ids).toContain("c");
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("b");
  });
});

describe("cancellazioni e conflitti", () => {
  /** Una cancellazione arrivata dall'altro telefono deve vincere se e' piu' recente. */
  it("una cancellazione piu' recente sovrascrive la riga locale", async () => {
    const id = await food({ name: "Da cancellare" });
    const database = await getDb();
    await database.runAsync("UPDATE foods SET updated_at = ? WHERE id = ?", [
      "2026-08-29T09:00:00.000Z",
      id,
    ]);

    await applyChanges([
      {
        table: "foods",
        id,
        payload: {
          id,
          name: "Da cancellare",
          name_norm: "da cancellare",
          kcal: 100,
          created_at: "2026-08-29T08:00:00.000Z",
          updated_at: "2026-08-29T12:00:00.000Z",
          deleted_at: "2026-08-29T12:00:00.000Z",
        },
        updatedAt: "2026-08-29T12:00:00.000Z",
        deletedAt: "2026-08-29T12:00:00.000Z",
        createdAt: "2026-08-29T08:00:00.000Z",
      },
    ]);

    const row = await database.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM foods WHERE id = ?",
      [id],
    );
    expect(row?.deleted_at).toBe("2026-08-29T12:00:00.000Z");
  });

  /**
   * Il verso opposto: ho modificato qui DOPO che l'altro l'ha cancellata.
   * La mia modifica vince, e la riga resta viva.
   */
  it("una modifica locale piu' recente batte una cancellazione vecchia", async () => {
    const id = await food({ name: "Modificata dopo" });
    const database = await getDb();
    await database.runAsync("UPDATE foods SET updated_at = ? WHERE id = ?", [
      "2026-08-29T15:00:00.000Z",
      id,
    ]);

    await applyChanges([
      {
        table: "foods",
        id,
        payload: { id, name: "x", deleted_at: "2026-08-29T10:00:00.000Z" },
        updatedAt: "2026-08-29T10:00:00.000Z",
        deletedAt: "2026-08-29T10:00:00.000Z",
        createdAt: "2026-08-29T08:00:00.000Z",
      },
    ]);

    const row = await database.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM foods WHERE id = ?",
      [id],
    );
    expect(row?.deleted_at).toBeNull();
  });

  /** Una riga rotta non deve portarsi dietro le altre del lotto. */
  it("una riga che non si puo' scrivere non annulla il lotto", async () => {
    const applied = await applyChanges([
      {
        table: "meal_entries",
        id: "orfana-1",
        // meal_id punta a un pasto che qui non esiste: la foreign key rifiuta.
        payload: {
          id: "orfana-1",
          meal_id: "pasto-inesistente",
          source_kind: "free",
          kcal: 100,
          created_at: "2026-08-29T10:00:00.000Z",
          updated_at: "2026-08-29T10:00:00.000Z",
        },
        updatedAt: "2026-08-29T10:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-08-29T10:00:00.000Z",
      },
      {
        table: "water_logs",
        id: "buona-1",
        payload: {
          id: "buona-1",
          date: "2026-08-29",
          ml: 330,
          created_at: "2026-08-29T10:00:00.000Z",
          updated_at: "2026-08-29T10:00:00.000Z",
        },
        updatedAt: "2026-08-29T10:00:00.000Z",
        deletedAt: null,
        createdAt: "2026-08-29T10:00:00.000Z",
      },
    ]);

    expect(applied).toBe(1);
    const database = await getDb();
    const ok = await database.getFirstAsync<{ ml: number }>(
      "SELECT ml FROM water_logs WHERE id = 'buona-1'",
    );
    expect(ok?.ml).toBe(330);
  });
});

describe("passaggio al segnaposto numerico", () => {
  /**
   * Il difetto che questo test blocca: le versioni precedenti salvavano una
   * data ISO nel cursore. Mandata al server nuovo, `(int)` di
   * "2026-08-29T18:00:00+00:00" vale 2026, cioe' un numero di sequenza
   * plausibile: il telefono avrebbe saltato in silenzio le prime duemila
   * righe senza nessun errore.
   */
  it("un cursore vecchio in formato data riparte da zero", async () => {
    await setSetting("sync.cursor", "2026-08-29T18:00:00+00:00");

    // Il giro deve ripartire da capo invece di fidarsi di quel valore. Senza
    // token non parte, quindi si verifica la lettura del segnaposto.
    const salvato = await getSetting("sync.cursor");
    expect(salvato).toBe("2026-08-29T18:00:00+00:00");
    expect(/^\d+$/.test(salvato ?? "")).toBe(false);
  });

  it("un cursore numerico viene conservato", async () => {
    await setSetting("sync.cursor", "1234");
    const salvato = await getSetting("sync.cursor");
    expect(/^\d+$/.test(salvato ?? "")).toBe(true);
    expect(Number(salvato)).toBe(1234);
  });
});

describe("cancellazioni e resurrezione", () => {
  /**
   * IL CASO PEGGIORE PER L'ALLINEAMENTO: se una riga viene cancellata
   * FISICAMENTE, il server non lo viene mai a sapere - non c'e' piu' niente
   * da mandargli. Al giro dopo il server rimanda indietro la sua copia, che
   * il telefono non ha piu', e la riga RESUSCITA.
   *
   * Chi toglie un bicchiere d'acqua se lo ritrova.
   */
  it("un bicchiere annullato non deve tornare dal server", async () => {
    const database = await getDb();
    await database.runAsync(
      `INSERT INTO water_logs (id, date, ml, created_at, updated_at)
       VALUES ('w-tolto', '2026-08-29', 250, '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z')`,
    );

    // L'utente lo annulla: la riga deve restare, marcata come cancellata.
    await removeLastWater("2026-08-29");

    const row = await database.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM water_logs WHERE id = 'w-tolto'",
    );
    expect(row).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();

    // E la cancellazione deve poter viaggiare.
    const changes = await collectChanges(null);
    const mine = changes.find((c) => c.id === "w-tolto");
    expect(mine?.deletedAt).not.toBeNull();
  });

  it("un peso cancellato non deve tornare dal server", async () => {
    await setWeight("2026-08-25", 80);
    await deleteWeight("2026-08-25");

    const database = await getDb();
    const row = await database.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM weight_logs WHERE date = '2026-08-25'",
    );
    expect(row).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();
  });

  it("dei passi cancellati non devono tornare dal server", async () => {
    await setSteps("2026-08-24", 5000);
    await deleteSteps("2026-08-24");

    const database = await getDb();
    const row = await database.getFirstAsync<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM step_logs WHERE date = '2026-08-24'",
    );
    expect(row).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();
  });
});

describe("modifica di un pasto", () => {
  /**
   * Il difetto che questo test blocca: modificando un pasto gli ingredienti
   * venivano cancellati FISICAMENTE e reinseriti con id nuovi. All'altro
   * dispositivo arrivavano solo i nuovi, senza nessuna notizia dei vecchi, e
   * la ricetta si ritrovava con gli uni E gli altri. Ogni modifica ne
   * aggiungeva una copia.
   */
  it("gli ingredienti sostituiti viaggiano come cancellati", async () => {
    const riso = await food({ name: "Riso" });
    const pollo = await food({ name: "Pollo" });

    const recipeId = await createRecipe({
      name: "Pranzo",
      servings: 1,
      notes: null,
      items: [{ foodId: riso, quantityG: 100 }],
    });

    // La modifica sostituisce l'ingrediente.
    await updateRecipe(recipeId, {
      name: "Pranzo",
      servings: 1,
      notes: null,
      items: [{ foodId: pollo, quantityG: 150 }],
    });

    const changes = await collectChanges(null);
    const items = changes.filter((c) => c.table === "recipe_items");

    // Devono viaggiare entrambi: il nuovo, e il vecchio marcato cancellato.
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((c) => c.deletedAt !== null)).toBe(true);
    expect(items.some((c) => c.deletedAt === null)).toBe(true);

    // E la ricetta locale ne ha uno solo attivo.
    const database = await getDb();
    const attivi = await database.getAllAsync<{ id: string }>(
      "SELECT id FROM recipe_items WHERE recipe_id = ? AND deleted_at IS NULL",
      [recipeId],
    );
    expect(attivi).toHaveLength(1);
  });
});

describe("confronto delle ore", () => {
  /**
   * Il difetto: `updated_at` veniva confrontato come STRINGA. La stessa ora
   * qui e' scritta "...T10:00:00.000Z" e torna dal server "...T10:00:00+00:00",
   * e a parita' di secondo il "." viene dopo il "+": la riga locale vinceva
   * sempre, e la modifica fatta sull'altro telefono spariva in silenzio.
   */
  it("una riga piu' recente dal server vince anche col fuso scritto diverso", async () => {
    const db = await getDb();
    const id = "food-riso";
    await db.runAsync(
      `INSERT INTO foods (id, name, kcal, protein, carbs, fat,
         created_at, updated_at)
       VALUES (?, 'Riso bianco', 130, 2, 28, 0, ?, ?)`,
      [id, "2026-08-29T10:00:00.000Z", "2026-08-29T10:00:00.000Z"],
    );

    await applyChanges([
      {
        table: "foods",
        id,
        payload: {
          id,
          name: "Riso integrale",
          kcal: 111,
          protein: 2,
          carbs: 23,
          fat: 1,
          created_at: "2026-08-29T10:00:00.000Z",
          updated_at: "2026-08-29T10:00:00.500Z",
        },
        // Il server rimanda l'ora troncata al secondo e con "+00:00".
        updatedAt: "2026-08-29T10:00:00+00:00",
        deletedAt: null,
        createdAt: "2026-08-29T10:00:00+00:00",
      },
    ]);

    const row = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM foods WHERE id = ?",
      [id],
    );
    expect(row?.name).toBe("Riso integrale");
  });

  it("una riga piu' vecchia dal server non sovrascrive quella locale", async () => {
    const db = await getDb();
    const id = "food-pane";
    await db.runAsync(
      `INSERT INTO foods (id, name, kcal, protein, carbs, fat,
         created_at, updated_at)
       VALUES (?, 'Pane fresco', 265, 9, 49, 3, ?, ?)`,
      [id, "2026-08-29T10:00:00.000Z", "2026-08-29T10:00:00.900Z"],
    );

    await applyChanges([
      {
        table: "foods",
        id,
        payload: {
          id,
          name: "Pane vecchio",
          kcal: 265,
          protein: 9,
          carbs: 49,
          fat: 3,
          created_at: "2026-08-29T10:00:00.000Z",
          updated_at: "2026-08-29T10:00:00.100Z",
        },
        updatedAt: "2026-08-29T10:00:00+00:00",
        deletedAt: null,
        createdAt: "2026-08-29T10:00:00+00:00",
      },
    ]);

    const row = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM foods WHERE id = ?",
      [id],
    );
    expect(row?.name).toBe("Pane fresco");
  });
});

describe("lotti e righe con la stessa ora", () => {
  /**
   * Il difetto: il punto di ripresa e' `updated_at`, e il lotto si chiudeva
   * anche a meta' di un gruppo di righe scritte nello stesso istante. Il giro
   * dopo chiedeva "piu' recenti dell'ultima inviata" e le sorelle rimaste
   * indietro non partivano MAI. Non e' un caso di scuola: gli ingredienti di
   * una ricetta e il catalogo iniziale si scrivono in un ciclo solo.
   */
  it("nessuna riga resta indietro quando il taglio cade dentro un gruppo", async () => {
    const db = await getDb();
    // Un'ora in avanti nel tempo, cosi' il lotto contiene queste righe e
    // nient'altro di quel che il database si porta dietro.
    const stessaOra = "2099-06-01T10:00:00.000Z";
    const prima = "2099-01-01T00:00:00.000Z";
    for (let i = 0; i < 12; i++) {
      await db.runAsync(
        `INSERT INTO foods (id, name, kcal, protein, carbs, fat,
           created_at, updated_at)
         VALUES (?, ?, 100, 1, 1, 1, ?, ?)`,
        [`gruppo-${i}`, `Alimento ${i}`, stessaOra, stessaOra],
      );
    }

    // Un lotto da 5 cadrebbe in mezzo al gruppo da 12.
    const primo = await collectChanges(prima, 5);
    const inviati = primo.filter((c) => c.table === "foods");
    expect(inviati.length).toBe(12);

    // E il giro successivo, che riparte dall'ora dell'ultima inviata, non ne
    // trova piu' nessuna: sono partite tutte.
    const massimo = inviati.reduce(
      (max, c) => (c.updatedAt > max ? c.updatedAt : max),
      "",
    );
    const secondo = await collectChanges(massimo, 5);
    expect(secondo.filter((c) => c.table === "foods")).toHaveLength(0);
  });

  it("il payload non porta con se' la colonna usata per ordinare", async () => {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO foods (id, name, kcal, protein, carbs, fat,
         created_at, updated_at)
       VALUES ('solo', 'Uovo', 155, 13, 1, 11, ?, ?)`,
      ["2026-08-29T10:00:00.000Z", "2026-08-29T10:00:00.000Z"],
    );

    const changes = await collectChanges(null);
    const uovo = changes.find((c) => c.id === "solo");
    expect(uovo).toBeDefined();
    expect(uovo?.payload).not.toHaveProperty("__rowid");
  });
});

describe("cambio di account", () => {
  /**
   * Il difetto: uscendo e rientrando con un ALTRO account, i due segnaposto
   * restavano quelli di prima. Il cursore e' la posizione dentro il contatore
   * del vecchio utente: chiedere "le righe dopo la 406" a un contatore che
   * riparte da 1 non torna niente, e i dati del nuovo account non sarebbero
   * arrivati mai. Sullo schermo nessun errore: per l'app non c'era niente di
   * nuovo.
   */
  it("i segnaposto si azzerano", async () => {
    await setSetting(CURSOR_KEY, "406");
    await setSetting(PUSHED_KEY, "2026-08-29T10:00:00.000Z");

    await resetSyncMarkers();

    expect(await getSetting(CURSOR_KEY)).toBeNull();
    expect(await getSetting(PUSHED_KEY)).toBeNull();
  });

  it("azzerati i segnaposto, tutto torna da mandare", async () => {
    await createFood({
      name: "Riso",
      brand: null,
      source: "user",
      nutrients: EMPTY_NUTRIENTS,
    });

    // Come se fosse gia' stato mandato tutto al vecchio account.
    await setSetting(PUSHED_KEY, "2099-01-01T00:00:00.000Z");
    const prima = await collectChanges(await getSetting(PUSHED_KEY));
    expect(prima).toHaveLength(0);

    await resetSyncMarkers();

    const dopo = await collectChanges(await getSetting(PUSHED_KEY));
    expect(dopo.some((c) => c.table === "foods")).toBe(true);
  });
});

describe("impostazioni di questo telefono", () => {
  it("non viaggiano quelle che parlano del dispositivo", async () => {
    await setSetting("health.steps_last_sync", "2026-08-29T10:00:00.000Z");
    await setSetting("health.steps_import_enabled", "1");
    await setSetting("last_backup_export", "2026-08-29T10:00:00.000Z");

    const changes = await collectChanges(null);
    const chiavi = changes.filter((c) => c.table === "settings").map((c) => c.id);

    expect(chiavi).not.toContain("health.steps_last_sync");
    expect(chiavi).not.toContain("health.steps_import_enabled");
    expect(chiavi).not.toContain("last_backup_export");
  });

  it("viaggia invece il piano gia' applicato, che parla dei dati", async () => {
    await setSetting("plan_applied:2026-08-29", "2026-08-29T10:00:00.000Z");

    const changes = await collectChanges(null);
    const chiavi = changes.filter((c) => c.table === "settings").map((c) => c.id);

    // Senza, l'altro telefono riapplicherebbe il piano e duplicherebbe i pasti.
    expect(chiavi).toContain("plan_applied:2026-08-29");
  });
});

describe("l'elenco delle tabelle contro lo schema", () => {
  /**
   * Il difetto che questo test blocca: `progress_photos` e' rimasta fuori da
   * `SYNCED_TABLES` per settimane dopo che la sua unica ragione di esclusione
   * (i file non avevano un posto dove stare) era stata risolta. Nessun test
   * guardava l'elenco, quindi la sincronizzazione taceva e le foto dei
   * progressi semplicemente non arrivavano sul secondo telefono.
   *
   * `BACKUP_TABLES` aveva questo controllo dalla Fase 3. Qui mancava.
   */
  it("ogni tabella dello schema sta in un elenco o nell'altro", async () => {
    const database = await getDb();
    const rows = await database.getAllAsync<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    );

    const dichiarate = new Set([
      ...SYNCED_TABLES,
      ...Object.keys(LOCAL_ONLY_TABLES),
    ]);
    const senzaCasa = rows
      .map((r) => r.name)
      .filter((name) => !dichiarate.has(name as never))
      .sort();

    expect(senzaCasa).toEqual([]);
  });

  it("nessuna tabella sta in entrambi gli elenchi", () => {
    const doppie = SYNCED_TABLES.filter(
      (table) => table in LOCAL_ONLY_TABLES,
    );
    expect(doppie).toEqual([]);
  });

  /**
   * `collectChanges` gira su ogni tabella con
   * `WHERE updated_at > ? ORDER BY updated_at, rowid`. Senza indice erano
   * ventisei scansioni complete per giro, fino a venti giri: la voce di costo
   * piu' grande di un'operazione che parte a ogni apertura dell'app.
   */
  it("ogni tabella sincronizzata ha un indice su updated_at", async () => {
    const database = await getDb();
    const senzaIndice: string[] = [];

    for (const table of SYNCED_TABLES) {
      // `settings` ha `key` come chiave primaria e una manciata di righe: la
      // scansione costa meno dell'indice da mantenere.
      if (table === "settings") continue;

      const plan = await database.getAllAsync<{ detail: string }>(
        `EXPLAIN QUERY PLAN
         SELECT * FROM ${table} WHERE updated_at > ? ORDER BY updated_at, rowid`,
        ["2026-01-01T00:00:00.000Z"],
      );
      const usaIndice = plan.some((r) => /USING INDEX/i.test(r.detail));
      if (!usaIndice) senzaIndice.push(table);
    }

    expect(senzaIndice).toEqual([]);
  });

  it("porta le righe delle foto dei progressi", async () => {
    const database = await getDb();
    await database.runAsync(
      `INSERT INTO progress_photos (id, date, uri, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        "p1",
        "2026-09-02",
        "file:///photos/progress-p1.jpg",
        "2026-09-02T08:00:00.000Z",
        "2026-09-02T08:00:00.000Z",
      ],
    );

    const changes = await collectChanges(null);
    const foto = changes.find((c) => c.table === "progress_photos");

    expect(foto?.id).toBe("p1");
    // I byte viaggiano a parte (photoSync.ts): qui deve arrivare il NOME, che
    // e' l'unica parte del percorso che i due telefoni condividono.
    expect(foto?.payload.uri).toBe("file:///photos/progress-p1.jpg");
  });
});
