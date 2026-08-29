/**
 * L'indirizzo del backend degli amici.
 *
 * Vuoto per impostazione predefinita, ed e' il caso normale: KalTrack e'
 * un'app locale e senza questo indirizzo funziona esattamente come sempre.
 * Solo la sezione amici ne ha bisogno, e quando manca lo dice invece di
 * mostrare una schermata che non puo' funzionare.
 *
 * Si imposta in `.env` come EXPO_PUBLIC_API_URL, per esempio
 * "https://kaltrack.example.com/api".
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(
  /\/+$/,
  "",
);

export const hasBackend = (): boolean => API_URL.length > 0;

/** Oltre questo tempo la rete non sta rispondendo. */
export const API_TIMEOUT_MS = 15_000;
