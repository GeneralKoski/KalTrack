import { aiAvailable } from "@/src/domain/aiAccess";

describe("aiAvailable", () => {
  it("senza account e' spenta", () => {
    expect(
      aiAvailable({ token: null, aiEnabled: null, isHydrated: true }),
    ).toBe(false);
  });

  it("senza account resta spenta anche con un ultimo valore noto acceso", () => {
    // Il valore noto vale per l'account che l'ha scritto: uscito
    // dall'account, non parla piu' di nessuno.
    expect(
      aiAvailable({ token: null, aiEnabled: true, isHydrated: true }),
    ).toBe(false);
  });

  it("con account e diritto e' accesa", () => {
    expect(
      aiAvailable({ token: "t", aiEnabled: true, isHydrated: true }),
    ).toBe(true);
  });

  it("con account e senza diritto e' spenta", () => {
    expect(
      aiAvailable({ token: "t", aiEnabled: false, isHydrated: true }),
    ).toBe(false);
  });

  it("con account e valore ancora ignoto e' ACCESA", () => {
    // Offline al primo avvio dopo l'accesso: `null` vuol dire "non lo so
    // ancora", e negare il diritto per ignoranza lo negherebbe a chi paga.
    // Il cartello non e' una serratura: sbagliare in favore dell'utente qui
    // non apre niente che il server non conceda.
    expect(
      aiAvailable({ token: "t", aiEnabled: null, isHydrated: true }),
    ).toBe(true);
  });

  describe("prima che l'idratazione finisca", () => {
    /**
     * `restore()` legge SecureStore in modo asincrono: per una finestra reale
     * `token` e' `null` senza che questo dica ancora niente. Un deep link a
     * freddo arriva spesso prima che quella lettura sia finita - e' proprio
     * il caso che ha portato un utente con diritto sui piani.
     */
    it("e' ACCESA anche senza token e senza un valore noto", () => {
      expect(
        aiAvailable({ token: null, aiEnabled: null, isHydrated: false }),
      ).toBe(true);
    });

    it("e' ACCESA anche se l'ultimo valore noto (di un altro account) era spento", () => {
      expect(
        aiAvailable({ token: null, aiEnabled: false, isHydrated: false }),
      ).toBe(true);
    });
  });
});
