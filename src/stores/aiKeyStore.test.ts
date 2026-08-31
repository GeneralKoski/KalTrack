import { useAiKeyStore } from "@/src/stores/aiKeyStore";
import * as SecureStore from "expo-secure-store";

const memoria = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

beforeEach(() => {
  memoria.clear();
  useAiKeyStore.setState({ key: null, isHydrated: false });
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(
    async (k: string) => memoria.get(k) ?? null,
  );
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(
    async (k: string, v: string) => void memoria.set(k, v),
  );
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(
    async (k: string) => void memoria.delete(k),
  );
});

describe("la chiave dell'assistente", () => {
  it("si salva e si rilegge dopo un riavvio", async () => {
    await useAiKeyStore.getState().save("gsk_prova123");
    expect(useAiKeyStore.getState().key).toBe("gsk_prova123");

    // Come un riavvio: lo store riparte vuoto e si riempie da SecureStore.
    useAiKeyStore.setState({ key: null, isHydrated: false });
    await useAiKeyStore.getState().restore();

    expect(useAiKeyStore.getState().key).toBe("gsk_prova123");
    expect(useAiKeyStore.getState().isHydrated).toBe(true);
  });

  it("toglie gli spazi, che incollando arrivano quasi sempre", async () => {
    await useAiKeyStore.getState().save("  gsk_prova123\n");
    expect(useAiKeyStore.getState().key).toBe("gsk_prova123");
  });

  it("rimuoverla la toglie anche da SecureStore, non solo dallo schermo", async () => {
    await useAiKeyStore.getState().save("gsk_prova123");
    await useAiKeyStore.getState().clear();

    expect(useAiKeyStore.getState().key).toBeNull();
    await useAiKeyStore.getState().restore();
    expect(useAiKeyStore.getState().key).toBeNull();
  });

  it("una lettura che fallisce non blocca l'avvio", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error("keystore non disponibile"),
    );

    await useAiKeyStore.getState().restore();

    // Idratato lo stesso: l'app deve partire, semplicemente senza AI.
    expect(useAiKeyStore.getState().isHydrated).toBe(true);
    expect(useAiKeyStore.getState().key).toBeNull();
  });
});

describe("la chiave non deve finire nei dati sincronizzati", () => {
  /**
   * La strada piu' corta era salvarla in `settings`, che e' una tabella
   * sincronizzata: la chiave sarebbe arrivata al server dentro `sync_records`,
   * in chiaro, rifacendo da un'altra parte lo stesso danno che questa modifica
   * doveva togliere.
   */
  it("passa da SecureStore e non dal database", async () => {
    await useAiKeyStore.getState().save("gsk_segreta");

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      "kaltrack_ai_key",
      "gsk_segreta",
    );
  });
});
