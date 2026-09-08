import { aiAvailable } from "@/src/domain/aiAccess";

describe("aiAvailable", () => {
  it("senza account e' spenta", () => {
    expect(aiAvailable({ token: null, aiEnabled: null })).toBe(false);
  });

  it("senza account resta spenta anche con un ultimo valore noto acceso", () => {
    // Il valore noto vale per l'account che l'ha scritto: uscito
    // dall'account, non parla piu' di nessuno.
    expect(aiAvailable({ token: null, aiEnabled: true })).toBe(false);
  });

  it("con account e diritto e' accesa", () => {
    expect(aiAvailable({ token: "t", aiEnabled: true })).toBe(true);
  });

  it("con account e senza diritto e' spenta", () => {
    expect(aiAvailable({ token: "t", aiEnabled: false })).toBe(false);
  });

  it("con account e valore ancora ignoto e' ACCESA", () => {
    // Offline al primo avvio dopo l'accesso: `null` vuol dire "non lo so
    // ancora", e negare il diritto per ignoranza lo negherebbe a chi paga.
    // Il cartello non e' una serratura: sbagliare in favore dell'utente qui
    // non apre niente che il server non conceda.
    expect(aiAvailable({ token: "t", aiEnabled: null })).toBe(true);
  });
});
