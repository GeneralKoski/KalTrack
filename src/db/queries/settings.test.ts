import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  getProfile,
  getSetting,
  getTargetsFor,
  saveProfile,
  saveTargets,
  setSetting,
} from "@/src/db/queries/settings";

beforeEach(async () => {
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

const targets = (validFrom: string, kcal: number) => ({
  validFrom,
  kcal,
  proteinG: 160,
  carbsG: 200,
  fatG: 70,
  steps: 10000,
});

describe("saveProfile", () => {
  it("salva e rilegge il profilo", async () => {
    await saveProfile({
      sex: "male",
      birthdate: "1995-06-15",
      heightCm: 180,
      activityLevel: "moderate",
      goal: "cut",
    });

    const profile = await getProfile();
    expect(profile?.height_cm).toBe(180);
    expect(profile?.goal).toBe("cut");
    expect(profile?.sex).toBe("male");
  });

  it("resta una riga sola: salvare di nuovo aggiorna", async () => {
    await saveProfile({ sex: "male", birthdate: "1995-06-15", heightCm: 180, activityLevel: "moderate", goal: "cut" });
    await saveProfile({ sex: "male", birthdate: "1995-06-15", heightCm: 182, activityLevel: "active", goal: "bulk" });

    expect((await getProfile())?.height_cm).toBe(182);
    expect((await getProfile())?.goal).toBe("bulk");
  });

  it("senza profilo ritorna null", async () => {
    expect(await getProfile()).toBeNull();
  });
});

describe("getTargetsFor", () => {
  it("senza obiettivi ritorna null", async () => {
    expect(await getTargetsFor("2026-08-28")).toBeNull();
  });

  it("ritorna l'obiettivo in vigore alla data", async () => {
    await saveTargets(targets("2026-01-01", 2000));
    await saveTargets(targets("2026-06-01", 2400));

    expect((await getTargetsFor("2026-03-15"))?.kcal).toBe(2000);
    expect((await getTargetsFor("2026-08-28"))?.kcal).toBe(2400);
  });

  it("vale dal giorno stesso di valid_from", async () => {
    await saveTargets(targets("2026-06-01", 2400));
    expect((await getTargetsFor("2026-06-01"))?.kcal).toBe(2400);
  });

  it("una data precedente a ogni obiettivo ritorna null", async () => {
    await saveTargets(targets("2026-06-01", 2400));
    expect(await getTargetsFor("2026-01-01")).toBeNull();
  });

  it("salvare due volte la stessa valid_from sostituisce invece di duplicare", async () => {
    await saveTargets(targets("2026-06-01", 2400));
    await saveTargets(targets("2026-06-01", 2600));

    expect((await getTargetsFor("2026-06-01"))?.kcal).toBe(2600);
  });

  it("cambiare obiettivo oggi non tocca il passato", async () => {
    await saveTargets(targets("2026-01-01", 2000));
    await saveTargets(targets("2026-08-28", 2600));

    // Marzo continua a essere misurato sull'obiettivo di marzo.
    expect((await getTargetsFor("2026-03-15"))?.kcal).toBe(2000);
  });
});

describe("settings", () => {
  it("legge null per una chiave assente", async () => {
    expect(await getSetting("voice_reply_enabled")).toBeNull();
  });

  it("scrive e rilegge", async () => {
    await setSetting("voice_reply_enabled", "true");
    expect(await getSetting("voice_reply_enabled")).toBe("true");
  });

  it("sovrascrive una chiave esistente", async () => {
    await setSetting("lang", "it");
    await setSetting("lang", "en");
    expect(await getSetting("lang")).toBe("en");
  });
});
