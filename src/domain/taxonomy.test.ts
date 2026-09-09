import type { TaxonomyRow } from "@/src/db/queries/taxonomies";
import { defaultSlug, knownSlugs, taxonomyLabel } from "@/src/domain/taxonomy";

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

/**
 * F8 della review finale: `DEFAULT_MUSCLE_GROUP` e' un letterale del seme che
 * un amministratore puo' ritirare dal pannello, e il modulo lo mostrava
 * selezionato mentre disegnava l'elenco dei gruppi vivi - un valore fuori
 * dalle proprie opzioni, scritto in colonna al salvataggio.
 */
describe("defaultSlug", () => {
  it("tiene il preferito se l'elenco lo conosce ancora", () => {
    const righe = [riga({ slug: "schiena" }), riga()];

    expect(defaultSlug(righe, "petto")).toBe("petto");
  });

  it("ricade sul primo dell'elenco se il preferito e' stato ritirato", () => {
    // L'elenco arriva gia' ordinato per `sort`: il primo e' quello che il
    // selettore mostra per primo, quindi partire da li' non sposta niente
    // agli occhi di chi apre il modulo.
    const righe = [riga({ slug: "schiena" }), riga({ slug: "gambe" })];

    expect(defaultSlug(righe, "petto")).toBe("schiena");
  });

  /**
   * L'elenco vuoto e' la tassonomia che non si e' potuta leggere: il modulo
   * non ha comunque opzioni da offrire e lo dice a schermo, quindi tornare il
   * preferito e' meglio che tornare una stringa vuota.
   */
  it("a elenco vuoto torna il preferito", () => {
    expect(defaultSlug([], "petto")).toBe("petto");
  });
});
