import { API_TIMEOUT_MS, API_URL, hasBackend } from "@/src/api/config";
import { logger } from "@/src/utils/logger";
import axios, { AxiosError, type AxiosInstance } from "axios";

/**
 * L'unica istanza che parla col backend.
 *
 * Bearer e non cookie: siamo su mobile, non c'e' un browser che tenga una
 * sessione. Il token lo fornisce chi chiama `setAuthTokenProvider`, cosi'
 * questo file non dipende dallo store e lo store non dipende da axios.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Errori di validazione per campo, come li manda Laravel. */
    readonly errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True quando il token non vale piu': chi ascolta deve disconnettere. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

export class BackendNotConfiguredError extends Error {
  constructor() {
    super("Nessun indirizzo del backend configurato");
    this.name = "BackendNotConfiguredError";
  }
}

type TokenProvider = () => string | null;

let tokenProvider: TokenProvider = () => null;

/** Chi ha il token lo espone qui, senza che il client conosca lo store. */
export function setAuthTokenProvider(provider: TokenProvider): void {
  tokenProvider = provider;
}

type LanguageProvider = () => string;

// Default prima che `translationStore` si registri (vedi in fondo a quel
// file): coincide con l'inglese di serie del server, quindi anche una
// richiesta partita in quella finestra minuscola resta corretta.
let languageProvider: LanguageProvider = () => "en";

/** Idem per la lingua: la manda il server nei messaggi di validazione. */
export function setLanguageProvider(provider: LanguageProvider): void {
  languageProvider = provider;
}

const instance: AxiosInstance = axios.create({
  timeout: API_TIMEOUT_MS,
  headers: { Accept: "application/json" },
});

instance.interceptors.request.use((config) => {
  const token = tokenProvider();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers["Accept-Language"] = languageProvider();
  return config;
});

/**
 * Traduce l'errore di rete in qualcosa che una schermata puo' mostrare.
 *
 * Laravel manda `message` e `errors`; axios manda un errore senza risposta
 * quando la rete non c'e'. Senza questa conversione ogni chiamante dovrebbe
 * ricordarsi la forma di entrambi.
 */
const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  const axiosError = error as AxiosError<{
    message?: string;
    errors?: Record<string, string[]>;
  }>;
  const status = axiosError.response?.status ?? null;
  const message =
    axiosError.response?.data?.message ??
    (status === null ? "Nessuna connessione" : "Richiesta non riuscita");
  return new ApiError(message, status, axiosError.response?.data?.errors ?? {});
};

export async function apiRequest<T>(args: {
  method: "get" | "post" | "patch" | "put" | "delete";
  path: string;
  body?: unknown;
  params?: Record<string, string>;
}): Promise<T> {
  if (!hasBackend()) throw new BackendNotConfiguredError();

  try {
    const response = await instance.request<T>({
      method: args.method,
      url: `${API_URL}${args.path}`,
      data: args.body,
      params: args.params,
    });
    return response.data;
  } catch (error) {
    const apiError = toApiError(error);
    logger.warn(`[api] ${args.method} ${args.path}: ${apiError.message}`);
    throw apiError;
  }
}
