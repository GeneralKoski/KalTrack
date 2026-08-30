const enabled = process.env.EXPO_PUBLIC_CONSOLE_LOGGING !== "false";

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

/** Destinazione persistente dei guasti. La installa `initDatabase()`. */
type Sink = (level: "warn" | "error", parts: unknown[]) => void;

let sink: Sink | null = null;

/**
 * Collega il registro su database.
 *
 * Sta qui e non come import diretto perche' `src/db` importa gia' `logger`:
 * chiamarlo da dentro creerebbe un ciclo. Il verso giusto e' che sia il
 * database, quando e' pronto, a farsi trovare.
 */
export function setLogSink(next: Sink | null): void {
  sink = next;
}

/**
 * Warn ed error passano anche dal registro, e lo fanno **a prescindere da
 * `enabled`**: la console si spegne apposta nelle build di release, cioe'
 * proprio quelle che girano sul telefono, dove un guasto non lo vede nessuno.
 */
const persisted =
  (level: "warn" | "error", write: LogFn): LogFn =>
  (...args) => {
    write(...args);
    sink?.(level, args);
  };

export const logger = {
  log: enabled ? (((...args) => console.log(...args)) as LogFn) : noop,
  info: enabled ? (((...args) => console.info(...args)) as LogFn) : noop,
  warn: persisted(
    "warn",
    enabled ? (((...args) => console.warn(...args)) as LogFn) : noop,
  ),
  error: persisted(
    "error",
    enabled ? (((...args) => console.error(...args)) as LogFn) : noop,
  ),
  debug: enabled ? (((...args) => console.debug(...args)) as LogFn) : noop,
};
