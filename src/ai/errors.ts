/** L'AI non è configurata: manca la chiave. Distinta da un errore di rete. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("Chiave API Google AI Studio non configurata");
    this.name = "MissingApiKeyError";
  }
}

/** Il dispositivo è offline: l'assistente non può funzionare. */
export class OfflineError extends Error {
  constructor() {
    super("Nessuna connessione");
    this.name = "OfflineError";
  }
}

/**
 * Quota esaurita: 429.
 *
 * Distinto da AiRequestError perché è l'unico guasto del provider su cui chi
 * usa l'app può fare qualcosa, cioè aspettare.
 */
export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number | null) {
    super(
      retryAfterSeconds === null
        ? "Quota API esaurita"
        : `Quota API esaurita, riprovare fra ${retryAfterSeconds} s`,
    );
    this.name = "RateLimitError";
  }
}

/** Il provider ha risposto con un errore. */
export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

/** La risposta è arrivata ma non ha la forma attesa. */
export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}
