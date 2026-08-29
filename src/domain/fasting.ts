export interface FastingProtocol {
  code: string;
  fastingHours: number;
  eatingHours: number;
}

/** I protocolli comuni. La somma fa sempre 24: è una giornata divisa in due. */
export const FASTING_PROTOCOLS: FastingProtocol[] = [
  { code: "12_12", fastingHours: 12, eatingHours: 12 },
  { code: "14_10", fastingHours: 14, eatingHours: 10 },
  { code: "16_8", fastingHours: 16, eatingHours: 8 },
  { code: "18_6", fastingHours: 18, eatingHours: 6 },
  { code: "20_4", fastingHours: 20, eatingHours: 4 },
];

const MS_PER_HOUR = 3_600_000;

/**
 * Ore trascorse da un istante. Mai negative: un orologio riportato indietro,
 * o un fuso cambiato in viaggio, non deve produrre un digiuno di durata
 * negativa che poi si propaga in percentuali assurde.
 */
export function hoursBetween(startedAt: string, now: Date): number {
  const elapsed = now.getTime() - new Date(startedAt).getTime();
  return Math.max(0, elapsed / MS_PER_HOUR);
}

export interface FastingProgress {
  elapsedHours: number;
  /** Frazione dell'obiettivo, 0..1. Null quando non c'è un obiettivo. */
  ratio: number | null;
  completed: boolean;
}

export function fastingProgress(args: {
  startedAt: string;
  targetHours: number | null;
  now: Date;
}): FastingProgress {
  const elapsedHours = hoursBetween(args.startedAt, args.now);
  if (!args.targetHours || args.targetHours <= 0) {
    return { elapsedHours, ratio: null, completed: false };
  }
  return {
    elapsedHours,
    // L'anello si ferma a pieno, ma le ore continuano a crescere: superare
    // l'obiettivo è un fatto da mostrare, non da nascondere.
    ratio: Math.min(elapsedHours / args.targetHours, 1),
    completed: elapsedHours >= args.targetHours,
  };
}

/** Durata leggibile: "16h", "8h 30m", "45m". */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
