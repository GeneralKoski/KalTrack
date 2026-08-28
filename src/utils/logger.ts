const enabled = process.env.EXPO_PUBLIC_CONSOLE_LOGGING !== "false";

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

export const logger = {
  log: enabled ? (((...args) => console.log(...args)) as LogFn) : noop,
  info: enabled ? (((...args) => console.info(...args)) as LogFn) : noop,
  warn: enabled ? (((...args) => console.warn(...args)) as LogFn) : noop,
  error: enabled ? (((...args) => console.error(...args)) as LogFn) : noop,
  debug: enabled ? (((...args) => console.debug(...args)) as LogFn) : noop,
};
