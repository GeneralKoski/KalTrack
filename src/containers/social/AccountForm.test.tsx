import { AccountForm } from "@/src/containers/social/AccountForm";
import React from "react";
import { TextInput as RNTextInput } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockLogin = jest.fn(async () => ({ token: "un-token" }));
jest.mock("@/src/api/social", () => ({
  login: () => mockLogin(),
}));

// Il prefisso `mock` non e' vezzo: jest.mock viene issato in cima al file, e
// senza quel prefisso rifiuta di leggere una variabile dichiarata dopo (come
// in catalogSync.test.ts).
const mockRunSync = jest.fn(async () => null);
jest.mock("@/src/services/sync", () => ({
  runSync: () => mockRunSync(),
}));

const mockSyncCatalog = jest.fn(async () => ({ toccate: 0, riuscito: true }));
jest.mock("@/src/services/catalogSync", () => ({
  syncCatalog: () => mockSyncCatalog(),
}));

const mockSignIn = jest.fn(async () => undefined);
// Lo store vero passa da SecureStore, dal database (`resetSyncMarkers`) e
// dal profilo remoto: tutta roba che `accountStore.test.ts` gia' verifica per
// conto suo. Qui interessa solo cosa fa `submit` DOPO che l'accesso e'
// andato a buon fine, quindi lo store si mocka intero.
jest.mock("@/src/stores/accountStore", () => ({
  useAccountStore: (selector: (state: { signIn: typeof mockSignIn }) => unknown) =>
    selector({ signIn: mockSignIn }),
}));

jest.mock("@/src/utils/toast", () => ({
  showToast: { success: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  mockLogin.mockClear();
  mockRunSync.mockClear();
  mockSyncCatalog.mockClear();
  mockSignIn.mockClear();
});

describe("AccountForm, l'accesso", () => {
  /**
   * L'accesso e' il momento in cui un account diventa disponibile per la
   * PRIMA volta su questo telefono, ed e' esattamente il motivo per cui
   * `submit` chiama gia' `runSync` senza aspettare il prossimo giro
   * periodico. Il catalogo ha la stessa ragione: senza questo innesco un
   * telefono che si iscrive ora aspetterebbe fino a un quarto d'ora (il
   * timer dello scheduler) prima di vedere il catalogo comune.
   */
  it("chiede anche il catalogo dopo l'accesso, non solo la copia dei dati", async () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<AccountForm />);
    });

    // Modulo di accesso (non di registrazione): solo login e password.
    const [login, password] = renderer.root.findAllByType(RNTextInput);

    act(() => {
      login.props.onChangeText("anna");
    });
    act(() => {
      password.props.onChangeText("segreta123");
    });

    await act(async () => {
      // Sull'ultimo campo, senza un `next`, l'invio manda il modulo - lo
      // stesso percorso del bottone.
      password.props.onSubmitEditing();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockSignIn).toHaveBeenCalledWith("un-token");
    expect(mockRunSync).toHaveBeenCalledTimes(1);
    expect(mockSyncCatalog).toHaveBeenCalledTimes(1);
  });
});
