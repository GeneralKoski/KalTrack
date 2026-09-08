import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  listAllTaxonomy,
  listTaxonomy,
  replaceTaxonomy,
  type TaxonomyKind,
} from "@/src/db/queries/taxonomies";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import localeEn from "@/src/i18n/locales/en.json";
import localeIt from "@/src/i18n/locales/it.json";
import { EQUIPMENT, MUSCLE_GROUPS } from "@/src/types/gym";

/** Le etichette che l'app mostrava prima che venissero dalla tabella. */
const daI18n: Record<
  TaxonomyKind,
  { it: Record<string, string>; en: Record<string, string> }
> = {
  muscle_groups: { it: localeIt.gym.muscle, en: localeEn.gym.muscle },
  equipment_types: { it: localeIt.gym.equipment, en: localeEn.gym.equipment },
};

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

  /**
   * LE ETICHETTE DEL SEME SONO ESATTAMENTE QUELLE CHE i18n MOSTRAVA, tutte e
   * ventitre'.
   *
   * Dal task 11 l'etichetta a schermo viene dalla riga e non piu' dalla
   * chiave `gym.muscle.*` / `gym.equipment.*`: se le due divergessero, la
   * palestra cambierebbe nome a un gruppo muscolare al primo avvio dopo
   * l'aggiornamento, senza che nessuno abbia toccato niente.
   *
   * Si confrontano TUTTE le righe e non una sola (com'era fin qui): un
   * refuso in una riga in mezzo all'elenco non lo vedrebbe nessuno finche'
   * non si apre proprio quella schermata in proprio quella lingua.
   */
  it.each(["muscle_groups", "equipment_types"] as const)(
    "porta le etichette di i18n, riga per riga (%s)",
    async (kind) => {
      const righe = await listTaxonomy(kind);

      expect(righe.map((r) => [r.slug, r.label_it, r.label_en])).toEqual(
        righe.map((r) => [
          r.slug,
          daI18n[kind].it[r.slug],
          daI18n[kind].en[r.slug],
        ]),
      );
    },
  );
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
