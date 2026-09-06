import type { AppLog } from "@/src/db/queries/logs";
import { groupLogs } from "@/src/domain/logs";

const log = (over: Partial<AppLog> = {}): AppLog => ({
  id: Math.random().toString(36),
  level: "warn",
  scope: "sync",
  message: "giro non riuscito",
  detail: null,
  createdAt: "2026-09-06T22:00:00.000Z",
  ...over,
});

describe("groupLogs", () => {
  it("conta le righe uguali invece di elencarle", () => {
    const groups = groupLogs([
      log({ createdAt: "2026-09-06T22:14:00.000Z" }),
      log({ createdAt: "2026-09-06T22:00:00.000Z" }),
      log({ createdAt: "2026-09-06T21:44:00.000Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].firstAt).toBe("2026-09-06T21:44:00.000Z");
    expect(groups[0].lastAt).toBe("2026-09-06T22:14:00.000Z");
  });

  /**
   * Un guasto che torna ogni quarto d'ora ha in mezzo le righe di tutto il
   * resto: raggruppare solo le righe adiacenti non ne unirebbe nemmeno due.
   */
  it("unisce anche righe non adiacenti", () => {
    const groups = groupLogs([
      log({ createdAt: "2026-09-06T22:14:00.000Z" }),
      log({ scope: "foto", message: "caricamento fallito" }),
      log({ createdAt: "2026-09-06T21:44:00.000Z" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.scope === "sync")?.count).toBe(2);
  });

  it("tiene separati livello, scope e messaggio diversi", () => {
    const groups = groupLogs([
      log({ level: "warn" }),
      log({ level: "error" }),
      log({ scope: "foto" }),
      log({ scope: null }),
      log({ message: "altro" }),
    ]);

    expect(groups).toHaveLength(5);
  });

  it("tiene il dettaglio dell'ultima volta, non della prima", () => {
    const groups = groupLogs([
      log({ createdAt: "2026-09-06T21:44:00.000Z", detail: "vecchio" }),
      log({ createdAt: "2026-09-06T22:14:00.000Z", detail: "recente" }),
    ]);

    expect(groups[0].detail).toBe("recente");
  });

  it("mette in cima quel che e' successo per ultimo", () => {
    const groups = groupLogs([
      log({ scope: "vecchio", createdAt: "2026-09-01T10:00:00.000Z" }),
      log({ scope: "nuovo", createdAt: "2026-09-06T22:14:00.000Z" }),
    ]);

    expect(groups.map((g) => g.scope)).toEqual(["nuovo", "vecchio"]);
  });

  it("un registro vuoto non ha gruppi", () => {
    expect(groupLogs([])).toEqual([]);
  });
});
