import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting, getDb } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createFood, getFood, searchFoods } from "@/src/db/queries/foods";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { setSteps } from "@/src/db/queries/tracking";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import {
  applyChanges,
  collectChanges,
  SYNCED_TABLES,
  type SyncChange,
} from "@/src/services/sync";

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
    // ai_calls e' il conto dei costi AI, progress_photos punta a file locali.
    expect(SYNCED_TABLES).not.toContain("ai_calls");
    expect(SYNCED_TABLES).not.toContain("progress_photos");
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
