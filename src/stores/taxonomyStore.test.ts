import { listAllTaxonomy } from "@/src/db/queries/taxonomies";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";

jest.mock("@/src/db/queries/taxonomies", () => ({
  listAllTaxonomy: jest.fn(),
}));

const mockedListAllTaxonomy = listAllTaxonomy as jest.MockedFunction<
  typeof listAllTaxonomy
>;

beforeEach(() => {
  mockedListAllTaxonomy.mockReset();
});

describe("hydrate", () => {
  /**
   * `App.tsx` chiama `useTaxonomyStore.getState().hydrate()` dentro lo
   * stesso `try` del gate d'avvio, PRIMA di
   * `useOnboardingStore.getState().hydrate()`: se questa risollevasse, il
   * `catch` del gate scriverebbe il suo log e l'idratazione
   * dell'onboarding non avverrebbe piu' - un'installazione nuova
   * atterrerebbe su Oggi invece che sul wizard. Il `try/catch` interno a
   * `hydrate` e' l'unica cosa che rende impossibile lo scenario, e senza
   * questo test un domani potrebbe sparire zitto.
   */
  it("non risolleva se la lettura fallisce, e sblocca comunque chi aspetta dopo di lei", async () => {
    mockedListAllTaxonomy.mockRejectedValue(new Error("database chiuso"));

    await expect(useTaxonomyStore.getState().hydrate()).resolves.toBeUndefined();
  });

  /**
   * QUI VIVE LA DISTINZIONE DEI TIPI DI PASTO applicata alle tassonomie, e
   * non nelle query: `listTaxonomy` filtrava i cancellati in SQL, non aveva
   * nessun chiamante di produzione ed e' stata ritirata (F5 della review
   * finale). Chi offre una scelta - i selettori, i chip, `create_exercise` -
   * legge `liveMuscleGroups`/`liveEquipment`; chi disegna l'etichetta di quel
   * che c'e' gia' legge `muscleGroups`/`equipment`. Senza questo test la
   * regola resterebbe scritta solo in prosa.
   */
  it("divide i vivi da tutti, che e' la lettura che ciascuno deve scegliere", async () => {
    const riga = (slug: string, deleted_at: string | null) => ({
      slug,
      label_it: slug,
      label_en: slug,
      sort: 10,
      deleted_at,
    });
    mockedListAllTaxonomy.mockImplementation(async (kind) =>
      kind === "muscle_groups"
        ? [riga("petto", null), riga("avambracci", "2026-09-08T09:00:00+00:00")]
        : [riga("bilanciere", null), riga("cavi", "2026-09-08T09:00:00+00:00")],
    );

    await useTaxonomyStore.getState().hydrate();
    const stato = useTaxonomyStore.getState();

    expect(stato.muscleGroups.map((r) => r.slug)).toEqual([
      "petto",
      "avambracci",
    ]);
    expect(stato.liveMuscleGroups.map((r) => r.slug)).toEqual(["petto"]);
    expect(stato.equipment.map((r) => r.slug)).toEqual(["bilanciere", "cavi"]);
    expect(stato.liveEquipment.map((r) => r.slug)).toEqual(["bilanciere"]);
    // L'etichetta di un cancellato c'e' comunque: e' il motivo per cui i
    // cancellati restano in tabella invece di sparire.
    expect(stato.muscleLabel("avambracci")).toBe("avambracci");
  });
});
