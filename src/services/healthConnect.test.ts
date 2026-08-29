import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { getSteps, setSteps } from "@/src/db/queries/tracking";
import {
  HealthPermissionError,
  HealthUnavailableError,
  type DailySteps,
  type HealthProvider,
  type HealthStatus,
  getLastStepSync,
  importStepsFromHealth,
  isStepImportEnabled,
  localDayBounds,
  recentDates,
  setStepImportEnabled,
  syncStepsOnStartup,
  unavailableProvider,
} from "@/src/services/healthConnect";

const freshDb = async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
};

beforeEach(freshDb);
afterEach(() => __setDbForTesting(null));

/** Provider di prova: restituisce esattamente le letture che gli si danno. */
const fakeProvider = (
  readings: DailySteps[],
  status: HealthStatus = { kind: "available", permissionGranted: true },
): HealthProvider & { requestedDates: string[] } => {
  const requestedDates: string[] = [];
  return {
    name: "fake",
    requestedDates,
    status: async () => status,
    requestPermission: async () => true,
    readDailySteps: async (dates) => {
      requestedDates.push(...dates);
      return readings.filter((r) => dates.includes(r.date));
    },
    openSettings: () => {},
  };
};

describe("recentDates", () => {
  it("torna i giorni dal più vecchio a quello di riferimento incluso", () => {
    expect(recentDates("2026-03-03", 3)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
    ]);
  });

  it("attraversa il cambio di mese", () => {
    expect(recentDates("2026-03-01", 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});

describe("localDayBounds", () => {
  it("copre esattamente 24 ore a partire dalla mezzanotte locale", () => {
    const bounds = localDayBounds("2026-05-10");
    expect(bounds).not.toBeNull();
    if (!bounds) return;
    const start = new Date(bounds.startTime);
    const end = new Date(bounds.endTime);
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(10);
    expect(end.getDate()).toBe(11);
  });

  it("rifiuta una data malformata invece di inventarne una", () => {
    expect(localDayBounds("10/05/2026")).toBeNull();
    expect(localDayBounds("")).toBeNull();
  });
});

describe("unavailableProvider", () => {
  it("dichiara il motivo e non finge di leggere", async () => {
    const provider = unavailableProvider("platform");
    await expect(provider.status()).resolves.toEqual({
      kind: "unavailable",
      reason: "platform",
    });
    await expect(provider.requestPermission()).resolves.toBe(false);
    await expect(provider.readDailySteps(["2026-05-10"])).rejects.toBeInstanceOf(
      HealthUnavailableError,
    );
  });
});

describe("importStepsFromHealth", () => {
  it("scrive i giorni scoperti con source health", async () => {
    const provider = fakeProvider([{ date: "2026-05-10", steps: 9200 }]);

    const outcome = await importStepsFromHealth({
      today: "2026-05-10",
      days: 1,
      provider,
    });

    expect(outcome).toEqual({ imported: 1, keptManual: 0, withoutData: 0 });
    const row = await getSteps("2026-05-10");
    expect(row?.steps).toBe(9200);
    expect(row?.source).toBe("health");
  });

  it("NON sovrascrive un valore inserito a mano", async () => {
    await setSteps("2026-05-10", 9450, "manual");
    const provider = fakeProvider([{ date: "2026-05-10", steps: 9200 }]);

    const outcome = await importStepsFromHealth({
      today: "2026-05-10",
      days: 1,
      provider,
    });

    expect(outcome.keptManual).toBe(1);
    expect(outcome.imported).toBe(0);
    const row = await getSteps("2026-05-10");
    expect(row?.steps).toBe(9450);
    expect(row?.source).toBe("manual");
  });

  it("NON sovrascrive nemmeno un valore dettato a voce", async () => {
    await setSteps("2026-05-10", 12000, "voice");
    const provider = fakeProvider([{ date: "2026-05-10", steps: 9200 }]);

    await importStepsFromHealth({ today: "2026-05-10", days: 1, provider });

    const row = await getSteps("2026-05-10");
    expect(row?.steps).toBe(12000);
    expect(row?.source).toBe("voice");
  });

  it("aggiorna invece un giorno già importato da Health Connect", async () => {
    await setSteps("2026-05-10", 4000, "health");
    const provider = fakeProvider([{ date: "2026-05-10", steps: 9200 }]);

    const outcome = await importStepsFromHealth({
      today: "2026-05-10",
      days: 1,
      provider,
    });

    expect(outcome.imported).toBe(1);
    expect((await getSteps("2026-05-10"))?.steps).toBe(9200);
  });

  it("salta l'utente e importa gli altri giorni nello stesso passaggio", async () => {
    await setSteps("2026-05-09", 9450, "manual");
    const provider = fakeProvider([
      { date: "2026-05-08", steps: 5000 },
      { date: "2026-05-09", steps: 9200 },
      { date: "2026-05-10", steps: 7100 },
    ]);

    const outcome = await importStepsFromHealth({
      today: "2026-05-10",
      days: 3,
      provider,
    });

    expect(outcome).toEqual({ imported: 2, keptManual: 1, withoutData: 0 });
    expect((await getSteps("2026-05-09"))?.steps).toBe(9450);
    expect((await getSteps("2026-05-08"))?.steps).toBe(5000);
    expect((await getSteps("2026-05-10"))?.steps).toBe(7100);
  });

  it("non crea righe a zero per i giorni senza dato", async () => {
    const provider = fakeProvider([{ date: "2026-05-10", steps: 7100 }]);

    const outcome = await importStepsFromHealth({
      today: "2026-05-10",
      days: 3,
      provider,
    });

    expect(outcome.withoutData).toBe(2);
    expect(await getSteps("2026-05-09")).toBeNull();
    expect(await getSteps("2026-05-08")).toBeNull();
  });

  it("chiede esattamente la finestra di giorni richiesta", async () => {
    const provider = fakeProvider([]);
    await importStepsFromHealth({ today: "2026-05-10", days: 3, provider });
    expect(provider.requestedDates).toEqual([
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ]);
  });

  it("registra l'ultima sincronizzazione anche senza dati importati", async () => {
    expect(await getLastStepSync()).toBeNull();
    await importStepsFromHealth({
      today: "2026-05-10",
      days: 1,
      provider: fakeProvider([]),
    });
    expect(await getLastStepSync()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("fallisce senza toccare il diario se la sorgente non è disponibile", async () => {
    await expect(
      importStepsFromHealth({
        today: "2026-05-10",
        provider: unavailableProvider("platform"),
      }),
    ).rejects.toBeInstanceOf(HealthUnavailableError);
    expect(await getLastStepSync()).toBeNull();
  });

  it("fallisce se il permesso non è stato concesso", async () => {
    const provider = fakeProvider([{ date: "2026-05-10", steps: 9200 }], {
      kind: "available",
      permissionGranted: false,
    });

    await expect(
      importStepsFromHealth({ today: "2026-05-10", days: 1, provider }),
    ).rejects.toBeInstanceOf(HealthPermissionError);
    expect(await getSteps("2026-05-10")).toBeNull();
  });
});

describe("interruttore di importazione", () => {
  it("parte spento e ricorda la scelta", async () => {
    expect(await isStepImportEnabled()).toBe(false);
    await setStepImportEnabled(true);
    expect(await isStepImportEnabled()).toBe(true);
    await setStepImportEnabled(false);
    expect(await isStepImportEnabled()).toBe(false);
  });
});

describe("sincronizzazione all'avvio", () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  it("non tocca nulla se l'interruttore è spento", async () => {
    const provider = fakeProvider([{ date: iso, steps: 5000 }]);
    expect(await syncStepsOnStartup({ provider })).toBeNull();
    expect(provider.requestedDates).toHaveLength(0);
    expect(await getSteps(iso)).toBeNull();
  });

  /**
   * Il difetto che questo test blocca: la preferenza veniva salvata ma non
   * letta da nessuna parte all'avvio, quindi "importazione automatica" era
   * un'etichetta senza codice dietro.
   */
  it("importa i passi quando l'interruttore è acceso", async () => {
    await setStepImportEnabled(true);
    const provider = fakeProvider([{ date: iso, steps: 5000 }]);
    const outcome = await syncStepsOnStartup({ provider });
    expect(outcome?.imported).toBe(1);
    expect((await getSteps(iso))?.steps).toBe(5000);
  });

  it("non fa fallire l'avvio se la sorgente non è disponibile", async () => {
    await setStepImportEnabled(true);
    const provider = fakeProvider([], {
      kind: "unavailable",
      reason: "provider_missing",
    });
    await expect(syncStepsOnStartup({ provider })).resolves.toBeNull();
  });

  it("non fa fallire l'avvio se il permesso è stato revocato", async () => {
    await setStepImportEnabled(true);
    const provider = fakeProvider([{ date: iso, steps: 100 }], {
      kind: "available",
      permissionGranted: false,
    });
    await expect(syncStepsOnStartup({ provider })).resolves.toBeNull();
  });
});
