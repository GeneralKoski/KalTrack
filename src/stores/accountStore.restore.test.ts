/**
 * `restore()` non deve mai restare a meta'. `App.tsx` monta la navigazione e
 * lascia partire `restore()` senza attenderlo: se quella promise non atterra
 * mai, `isHydrated` resta falso per sempre e con lui la catena di avvio
 * (`runSync`, `syncSharedStats`, il catalogo) non parte. Questo file simula
 * proprio il caso in cui la lettura del segnaposto va storta, per pinnare che
 * `restore()` arriva comunque a `isHydrated: true`.
 */
import { useAccountStore } from "@/src/stores/accountStore";

const mockReadAiEnabled = jest.fn(async () => {
  throw new Error("lettura del segnaposto guasta");
});
jest.mock("@/src/services/syncMarkers", () => ({
  ...jest.requireActual("@/src/services/syncMarkers"),
  readAiEnabled: () => mockReadAiEnabled(),
}));

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => "un-token"),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("@/src/api/social", () => ({
  fetchMyProfile: jest.fn(async () => {
    throw new Error("offline");
  }),
  logout: jest.fn(async () => undefined),
}));

describe("restore, quando la lettura del segnaposto va storta", () => {
  it("arriva comunque a isHydrated: true invece di restare impantanato", async () => {
    useAccountStore.setState({
      token: null,
      profile: null,
      aiEnabled: null,
      isHydrated: false,
    });

    await useAccountStore.getState().restore();

    expect(useAccountStore.getState().isHydrated).toBe(true);
  });
});
