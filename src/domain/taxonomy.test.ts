import type { TaxonomyRow } from "@/src/db/queries/taxonomies";
import { knownSlugs, taxonomyLabel } from "@/src/domain/taxonomy";

const riga = (over: Partial<TaxonomyRow> = {}): TaxonomyRow => ({
  slug: "petto",
  label_it: "Petto",
  label_en: "Chest",
  sort: 10,
  deleted_at: null,
  ...over,
});

describe("taxonomyLabel", () => {
  it("prende l'etichetta della riga, nella lingua chiesta", () => {
    const righe = [riga()];
    expect(taxonomyLabel(righe, "petto", "it", () => "!")).toBe("Petto");
    expect(taxonomyLabel(righe, "petto", "en", () => "!")).toBe("Chest");
  });

  /** Prima dell'idratazione la tabella non e' ancora stata letta. */
  it("ricade su i18n quando la riga non c'e'", () => {
    expect(taxonomyLabel([], "petto", "it", () => "Petto")).toBe("Petto");
  });

  /**
   * Uno slug aggiunto dal pannello non ha una chiave i18n per definizione, e
   * `[missing "en.gym.muscle.trapezi"]` a schermo sembra un difetto dell'app.
   */
  it("ricade sullo slug quando nemmeno i18n lo conosce", () => {
    expect(
      taxonomyLabel([], "trapezi", "en", () => '[missing "en.gym.muscle.trapezi"]'),
    ).toBe("trapezi");
  });

  it("un gruppo cancellato ha comunque la sua etichetta", () => {
    const righe = [riga({ deleted_at: "2026-09-08T09:00:00+00:00" })];
    expect(taxonomyLabel(righe, "petto", "it", () => "!")).toBe("Petto");
  });
});

describe("knownSlugs", () => {
  /**
   * I cancellati sono noti: un esercizio che nomina quello slug non diventa
   * sbagliato perche' il gruppo non si offre piu' in una scelta.
   */
  it("comprende i cancellati", () => {
    const righe = [riga(), riga({ slug: "avambracci", deleted_at: "2026-09-08T09:00:00+00:00" })];
    expect(knownSlugs(righe).has("avambracci")).toBe(true);
    expect(knownSlugs(righe).has("branchie")).toBe(false);
  });
});
