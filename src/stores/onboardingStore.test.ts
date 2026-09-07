import { getSetting } from "@/src/db/queries/settings";
import { useOnboardingStore } from "@/src/stores/onboardingStore";

jest.mock("@/src/db/queries/settings", () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

const mockedGetSetting = getSetting as jest.MockedFunction<typeof getSetting>;

const withSettings = (values: Record<string, string | null>) => {
  mockedGetSetting.mockImplementation(async (key: string) => values[key] ?? null);
};

beforeEach(() => {
  mockedGetSetting.mockReset();
  useOnboardingStore.setState({ isHydrated: false, completed: false });
});

describe("stato del primo avvio", () => {
  it("è completo solo con il valore scritto da complete()", async () => {
    withSettings({ onboarding_completed: "1" });
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().completed).toBe(true);
  });

  /**
   * Si leggeva la PRESENZA della chiave (`!== null`), quindi "0" valeva
   * "completato" e non c'era modo di dire di no se non cancellando la riga.
   */
  it('non è completo con "0"', async () => {
    withSettings({ onboarding_completed: "0" });
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().completed).toBe(false);
  });

  it("non è completo su un'installazione nuova", async () => {
    withSettings({});
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().completed).toBe(false);
  });

  it("riprende dal passo salvato, e dal primo se non esiste più", async () => {
    withSettings({ onboarding_step: "OnboardingTheme" });
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().resumeStep).toBe("OnboardingTheme");

    // "OnboardingWeight" era uno dei sette passi ed è stato tolto quando sono
    // diventati quattro: un telefono che aveva abbandonato il wizard lì ha
    // ancora quel nome scritto in `settings`, e deve ripartire dal primo passo
    // invece di puntare a una schermata che non c'è.
    withSettings({ onboarding_step: "OnboardingWeight" });
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().resumeStep).toBe("OnboardingWelcome");
  });

  /**
   * La Navigation aspetta `isHydrated` per decidere se mostrare il wizard:
   * restando falso l'app resterebbe sulla splash per sempre.
   */
  it("si sblocca comunque se la lettura fallisce", async () => {
    mockedGetSetting.mockRejectedValue(new Error("database chiuso"));
    await useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().isHydrated).toBe(true);
    expect(useOnboardingStore.getState().completed).toBe(false);
  });
});
