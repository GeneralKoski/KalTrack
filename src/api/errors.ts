/**
 * Gli errori della rete, fuori da `client.ts` di proposito.
 *
 * `client.ts` e' il modulo che i test sostituiscono con `jest.mock` per non
 * parlare davvero con la rete: quel che sta dentro sparisce insieme a lui.
 * Un tipo di errore e la domanda "l'ho gia' registrato?" devono restare veri
 * anche in un test che ha finto la rete, quindi vivono qui.
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

/**
 * Vero se l'errore e' gia' finito nel registro passando da `apiRequest`.
 *
 * `apiRequest` scrive metodo, percorso e messaggio del server per ogni
 * richiesta fallita. Il `catch` di chi l'ha chiamata aggiungeva una seconda
 * riga che diceva "e' fallito", cioe' quel che si sapeva gia': in Diagnostica
 * ogni guasto di rete compariva in coppia. Chi non ha niente da aggiungere
 * oltre al percorso usa questa e sta zitto; chi cattura anche errori che
 * `apiRequest` non ha visto continua a scriverli.
 */
export const alreadyLogged = (error: unknown): boolean =>
  error instanceof ApiError;
