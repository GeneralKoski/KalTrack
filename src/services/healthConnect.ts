import { getSetting, setSetting } from "@/src/db/queries/settings";
import { getSteps, setSteps } from "@/src/db/queries/tracking";
import { nowIso } from "@/src/db/ids";
import { logger } from "@/src/utils/logger";
import { Platform } from "react-native";

/**
 * Importazione automatica dei passi da Health Connect (solo Android).
 *
 * Il modulo è scritto attorno a un confine esplicito, `HealthProvider`: da una
 * parte l'implementazione reale che parla con Health Connect, dall'altra una
 * implementazione che si dichiara NON disponibile. Su iOS, sul web e su un
 * binario compilato prima dell'aggiunta della libreria nativa vale la seconda,
 * e l'app continua a funzionare con l'inserimento manuale.
 *
 * Health Connect non esiste su iOS: lì l'equivalente è HealthKit, che è
 * un'altra libreria e un altro provider. Questo file non finge di coprirlo.
 */

/** Perché Health Connect non è utilizzabile su questo dispositivo. */
export type HealthUnavailableReason =
  /** Piattaforma senza Health Connect (iOS, web). */
  | "platform"
  /** Android, ma la libreria nativa non è nel binario: serve un rebuild. */
  | "module_missing"
  /** Health Connect non installato (Android < 14 senza l'app dal Play Store). */
  | "provider_missing"
  /** Health Connect installato ma troppo vecchio per la SDK. */
  | "provider_outdated";

export type HealthStatus =
  | { kind: "available"; permissionGranted: boolean }
  | { kind: "unavailable"; reason: HealthUnavailableReason };

/** Totale passi di un giorno di calendario locale. */
export interface DailySteps {
  /** Data ISO YYYY-MM-DD. */
  date: string;
  steps: number;
}

/**
 * Il confine con la sorgente dati di salute. Chi importa i passi conosce solo
 * questa interfaccia: cambiare Health Connect con HealthKit, o con un finto
 * provider nei test, non tocca la logica di importazione.
 */
export interface HealthProvider {
  readonly name: string;
  status(): Promise<HealthStatus>;
  /** Chiede il permesso di lettura passi. Torna true se concesso. */
  requestPermission(): Promise<boolean>;
  /**
   * Passi per ciascuna delle date richieste. Le date SENZA dato vengono
   * omesse dal risultato: un giorno non misurato è assente, non zero.
   */
  readDailySteps(dates: string[]): Promise<DailySteps[]>;
  /** Apre le impostazioni della sorgente, per revocare o concedere a mano. */
  openSettings(): void;
}

export class HealthUnavailableError extends Error {
  constructor(readonly reason: HealthUnavailableReason) {
    super(`Sorgente salute non disponibile (${reason})`);
    this.name = "HealthUnavailableError";
  }
}

export class HealthPermissionError extends Error {
  constructor() {
    super("Permesso di lettura dei passi non concesso");
    this.name = "HealthPermissionError";
  }
}

// ─── Provider non disponibile ────────────────────────────────────────────────

/**
 * Implementazione onesta dell'assenza: dichiara il motivo e rifiuta le
 * letture invece di restituire dati inventati o zeri.
 */
export const unavailableProvider = (
  reason: HealthUnavailableReason,
): HealthProvider => ({
  name: `unavailable:${reason}`,
  status: async () => ({ kind: "unavailable", reason }),
  requestPermission: async () => false,
  readDailySteps: async () => {
    throw new HealthUnavailableError(reason);
  },
  openSettings: () => {},
});

// ─── Provider Health Connect (Android) ───────────────────────────────────────

type HealthConnectModule = typeof import("react-native-health-connect");

const isHealthConnectModule = (
  value: unknown,
): value is HealthConnectModule => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.initialize === "function" &&
    typeof candidate.getSdkStatus === "function" &&
    typeof candidate.aggregateRecord === "function" &&
    typeof candidate.requestPermission === "function" &&
    typeof candidate.getGrantedPermissions === "function" &&
    typeof candidate.openHealthConnectSettings === "function"
  );
};

let nativeModule: HealthConnectModule | null = null;
let nativeModuleTried = false;

/**
 * Caricamento pigro: il modulo nativo esiste solo in un binario ricompilato
 * dopo l'installazione della libreria. Importarlo in cima al file farebbe
 * fallire l'import su iOS e su ogni build precedente al rebuild.
 */
const loadNativeModule = (): HealthConnectModule | null => {
  if (nativeModuleTried) return nativeModule;
  nativeModuleTried = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require("react-native-health-connect");
    nativeModule = isHealthConnectModule(loaded) ? loaded : null;
    if (!nativeModule) {
      logger.warn("[healthConnect] modulo caricato ma con API inattesa");
    }
  } catch (error) {
    logger.warn("[healthConnect] modulo nativo non disponibile", error);
    nativeModule = null;
  }
  return nativeModule;
};

/**
 * Confini del giorno di calendario LOCALE espressi come istanti UTC: Health
 * Connect filtra per istante, e usare la mezzanotte UTC sposterebbe i passi
 * di un paio d'ore sul giorno sbagliato.
 */
export const localDayBounds = (
  date: string,
): { startTime: string; endTime: string } | null => {
  const parts = date.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day] = parts;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startTime: start.toISOString(), endTime: end.toISOString() };
};

const healthConnectProvider: HealthProvider = {
  name: "health-connect",

  async status() {
    const mod = loadNativeModule();
    if (!mod) return { kind: "unavailable", reason: "module_missing" };

    const sdk = await mod.getSdkStatus();
    if (sdk === mod.SdkAvailabilityStatus.SDK_UNAVAILABLE) {
      return { kind: "unavailable", reason: "provider_missing" };
    }
    if (sdk === mod.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return { kind: "unavailable", reason: "provider_outdated" };
    }

    const ready = await mod.initialize();
    if (!ready) return { kind: "unavailable", reason: "provider_missing" };

    const granted = await mod.getGrantedPermissions();
    return {
      kind: "available",
      permissionGranted: granted.some(
        (p) => p.accessType === "read" && p.recordType === "Steps",
      ),
    };
  },

  async requestPermission() {
    const mod = loadNativeModule();
    if (!mod) return false;
    await mod.initialize();
    const granted = await mod.requestPermission([
      { accessType: "read", recordType: "Steps" },
    ]);
    return granted.some(
      (p) => p.accessType === "read" && p.recordType === "Steps",
    );
  },

  async readDailySteps(dates) {
    const mod = loadNativeModule();
    if (!mod) throw new HealthUnavailableError("module_missing");

    const readings: DailySteps[] = [];
    // Una richiesta per giorno invece di un raggruppamento per periodo: così la
    // data di ogni totale è quella che abbiamo chiesto noi, e non va dedotta
    // dai bucket che Health Connect restituisce (che salta quando sono vuoti).
    for (const date of dates) {
      const bounds = localDayBounds(date);
      if (!bounds) continue;
      const result = await mod.aggregateRecord({
        recordType: "Steps",
        timeRangeFilter: { operator: "between", ...bounds },
      });
      // COUNT_TOTAL vale 0 sia con zero passi sia senza alcun dato: è
      // `dataOrigins` vuoto a dire che nessuna app ha scritto quel giorno, e
      // un giorno non misurato non va salvato come zero passi.
      if (result.dataOrigins.length === 0) continue;
      readings.push({ date, steps: Math.round(result.COUNT_TOTAL) });
    }
    return readings;
  },

  openSettings() {
    loadNativeModule()?.openHealthConnectSettings();
  },
};

// ─── Selezione del provider ──────────────────────────────────────────────────

let currentProvider: HealthProvider | null = null;

export function getHealthProvider(): HealthProvider {
  if (!currentProvider) {
    currentProvider =
      Platform.OS === "android"
        ? healthConnectProvider
        : unavailableProvider("platform");
  }
  return currentProvider;
}

/** Sostituisce il provider nei test. Passare null ripristina quello reale. */
export function __setHealthProviderForTesting(
  provider: HealthProvider | null,
): void {
  currentProvider = provider;
}

// ─── Impostazioni persistite ─────────────────────────────────────────────────

const ENABLED_KEY = "health.steps_import_enabled";
const LAST_SYNC_KEY = "health.steps_last_sync";

export async function isStepImportEnabled(): Promise<boolean> {
  return (await getSetting(ENABLED_KEY)) === "1";
}

export async function setStepImportEnabled(enabled: boolean): Promise<void> {
  await setSetting(ENABLED_KEY, enabled ? "1" : "0");
}

/** Istante ISO dell'ultima sincronizzazione riuscita, null se mai avvenuta. */
export async function getLastStepSync(): Promise<string | null> {
  return getSetting(LAST_SYNC_KEY);
}

// ─── Importazione ────────────────────────────────────────────────────────────

/** Quanti giorni indietro guardare: copre una settimana di app non aperta. */
export const STEP_IMPORT_DEFAULT_DAYS = 7;

export interface StepImportOutcome {
  /** Giorni scritti o aggiornati con il dato di Health Connect. */
  imported: number;
  /** Giorni lasciati intatti perché il valore era dell'utente. */
  keptManual: number;
  /** Giorni richiesti per cui Health Connect non aveva dati. */
  withoutData: number;
}

const todayIso = (): string => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
};

/** Le ultime `days` date fino a `today` incluso, dalla più vecchia. */
export const recentDates = (today: string, days: number): string[] => {
  const parts = today.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return [];
  const [year, month, day] = parts;
  const dates: string[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(year, month - 1, day - offset);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${d.getFullYear()}-${mm}-${dd}`);
  }
  return dates;
};

/**
 * Importa i passi degli ultimi giorni.
 *
 * REGOLA CENTRALE: un valore inserito dall'utente (a mano o a voce) non viene
 * mai sovrascritto. Chi scrive 9450 sa qualcosa che il telefono non sa - ha
 * camminato senza il telefono in tasca, o corregge una lettura sbagliata - e
 * vedersi il numero cambiato sotto le mani distruggerebbe la fiducia nel dato.
 * La sincronizzazione riempie i giorni scoperti e aggiorna solo se stessa.
 */
export async function importStepsFromHealth(
  options: {
    days?: number;
    /** Data di riferimento (YYYY-MM-DD); di default oggi. */
    today?: string;
    provider?: HealthProvider;
  } = {},
): Promise<StepImportOutcome> {
  const provider = options.provider ?? getHealthProvider();

  const status = await provider.status();
  if (status.kind === "unavailable") {
    throw new HealthUnavailableError(status.reason);
  }
  if (!status.permissionGranted) throw new HealthPermissionError();

  const days = Math.max(1, Math.trunc(options.days ?? STEP_IMPORT_DEFAULT_DAYS));
  const dates = recentDates(options.today ?? todayIso(), days);
  const readings = await provider.readDailySteps(dates);

  let imported = 0;
  let keptManual = 0;

  for (const reading of readings) {
    const existing = await getSteps(reading.date);
    if (existing && existing.source !== "health") {
      keptManual++;
      continue;
    }
    await setSteps(reading.date, reading.steps, "health");
    imported++;
  }

  // L'ultima sincronizzazione si segna anche quando non ha portato nulla:
  // dice all'utente che il collegamento funziona, non quanti dati sono arrivati.
  await setSetting(LAST_SYNC_KEY, nowIso());

  return { imported, keptManual, withoutData: dates.length - readings.length };
}

/**
 * L'importazione automatica all'avvio.
 *
 * È la funzione che rende vera l'etichetta "automatico" dell'interruttore
 * nelle impostazioni: senza questa chiamata la preferenza resterebbe salvata
 * e mai letta, e i passi arriverebbero solo premendo il pulsante a mano.
 *
 * Non solleva mai: all'avvio dell'app un errore di Health Connect - permesso
 * revocato dalle impostazioni di sistema, provider disinstallato - non deve
 * impedire di usare KalTrack. Il fallimento resta nel log e l'interruttore
 * nelle impostazioni mostra comunque lo stato reale.
 */
export async function syncStepsOnStartup(
  options: { provider?: HealthProvider } = {},
): Promise<StepImportOutcome | null> {
  try {
    if (!(await isStepImportEnabled())) return null;
    return await importStepsFromHealth(options);
  } catch (error) {
    logger.warn("[health] sincronizzazione automatica non riuscita", error);
    return null;
  }
}
