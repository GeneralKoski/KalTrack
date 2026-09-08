import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  listAllTaxonomy,
  listTaxonomy,
  replaceTaxonomy,
} from "@/src/db/queries/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/src/types/gym";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("il seme della migrazione 020", () => {
  /**
   * Il seme e le costanti devono coincidere: le costanti restano il minimo
   * garantito - quello che `keys.test.ts` controlla contro i18n - e un gruppo
   * aggiunto alle costanti senza aggiungerlo alla migrazione sarebbe un
   * gruppo che il compilatore conosce e il database no.
   */
  it("semina gli stessi slug delle costanti", async () => {
    const muscoli = await listTaxonomy("muscle_groups");
    expect(muscoli.map((r) => r.slug).sort()).toEqual(
      [...MUSCLE_GROUPS].sort(),
    );

    const attrezzi = await listTaxonomy("equipment_types");
    expect(attrezzi.map((r) => r.slug).sort()).toEqual([...EQUIPMENT].sort());
  });

  it("li ordina per `sort` e non alfabeticamente", async () => {
    const muscoli = await listTaxonomy("muscle_groups");
    expect(muscoli[0].slug).toBe("petto");
    expect(muscoli.at(-1)?.slug).toBe("full_body");
  });

  it("porta le etichette nelle due lingue", async () => {
    const [petto] = await listTaxonomy("muscle_groups");
    expect(petto.label_it).toBe("Petto");
    expect(petto.label_en).toBe("Chest");
  });
});

describe("replaceTaxonomy", () => {
  it("aggiorna un'etichetta e aggiunge uno slug nuovo", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "femorali", label_it: "Ischiocrurali", label_en: "Hamstrings", sort: 90, deleted_at: null },
      { slug: "trapezi", label_it: "Trapezi", label_en: "Traps", sort: 130, deleted_at: null },
    ]);

    const righe = await listTaxonomy("muscle_groups");
    expect(righe.find((r) => r.slug === "femorali")?.label_it).toBe(
      "Ischiocrurali",
    );
    expect(righe.find((r) => r.slug === "trapezi")?.label_en).toBe("Traps");
    // Gli altri undici restano: il server manda un elenco, non una verita'
    // esclusiva su quel che deve esistere in locale.
    expect(righe).toHaveLength(13);
  });

  /**
   * Uno slug cancellato dal pannello resta in tabella con la sua data: gli
   * esercizi che lo nominano devono continuare ad avere un'etichetta.
   */
  it("una riga cancellata esce da `listTaxonomy` e resta in `listAllTaxonomy`", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);

    const vivi = await listTaxonomy("muscle_groups");
    const tutti = await listAllTaxonomy("muscle_groups");

    expect(vivi.map((r) => r.slug)).not.toContain("avambracci");
    expect(tutti.map((r) => r.slug)).toContain("avambracci");
    expect(tutti.find((r) => r.slug === "avambracci")?.label_it).toBe(
      "Avambracci",
    );
  });

  /** Ripristinata dal pannello, torna in elenco. */
  it("una riga ripristinata torna fra i vivi", async () => {
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: "2026-09-08T09:00:00+00:00" },
    ]);
    await replaceTaxonomy("muscle_groups", [
      { slug: "avambracci", label_it: "Avambracci", label_en: "Forearms", sort: 60, deleted_at: null },
    ]);

    expect(
      (await listTaxonomy("muscle_groups")).map((r) => r.slug),
    ).toContain("avambracci");
  });

  it("un elenco vuoto non cancella niente", async () => {
    await replaceTaxonomy("muscle_groups", []);

    expect(await listTaxonomy("muscle_groups")).toHaveLength(12);
  });
});
