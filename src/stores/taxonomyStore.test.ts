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
});
