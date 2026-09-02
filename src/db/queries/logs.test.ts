import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import {
  aiUsage,
  clearLogs,
  MAX_LOG_ROWS,
  PRUNE_EVERY,
  recentLogs,
  recordLog,
  redactSecrets,
  splitScope,
} from "@/src/db/queries/logs";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

let db: LocalDatabase;

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(async () => {
  await clearLogs();
  __setDbForTesting(null);
});

describe("splitScope", () => {
  it("stacca il prefisso [scope] usato in tutto il codice", () => {
    expect(splitScope("[assistant] ciclo fallito")).toEqual({
      scope: "assistant",
      message: "ciclo fallito",
    });
  });

  it("lascia stare un messaggio senza prefisso", () => {
    expect(splitScope("qualcosa non va")).toEqual({
      scope: null,
      message: "qualcosa non va",
    });
  });
});

describe("redactSecrets", () => {
  it("nasconde una chiave Groq scritta da sola (registri anteriori a Gemini)", () => {
    expect(redactSecrets("chiave gsk_abcdefgh12345678 rifiutata")).toBe(
      "chiave gsk_<nascosta> rifiutata",
    );
  });

  it("nasconde le due forme della chiave Google AI Studio", () => {
    // Dal passaggio a Gemini il registro non nascondeva piu' niente: le forme
    // coperte erano solo quelle di Groq e OpenAI.
    expect(
      redactSecrets("chiave rifiutata: AIzaSyD-1a2b3c4d5e6f7g8h9i0jKLMNOP"),
    ).toBe("chiave rifiutata: AIza<nascosta>");
    expect(
      redactSecrets("chiave rifiutata: AQ.Ab8RN6JzQw_1a2b3c4d5e6f7g8h"),
    ).toBe("chiave rifiutata: AQ.<nascosta>");
  });

  it("nasconde la chiave passata nella URL", () => {
    // L'endpoint nativo la accettava in `?key=`, e un errore di rete si porta
    // dietro la URL intera.
    expect(
      redactSecrets(
        "POST https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyD1a2b3c4d5e6f7g8 fallita",
      ),
    ).toBe(
      "POST https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=<nascosta> fallita",
    );
  });

  it("nasconde un header Authorization intero", () => {
    expect(redactSecrets("Authorization: Bearer qualunquecosa")).toBe(
      "Authorization: Bearer <nascosta>",
    );
  });
});

describe("recordLog", () => {
  it("registra livello, scope, messaggio e dettaglio", async () => {
    await recordLog("error", [
      "[assistant] ciclo fallito",
      new Error("Groq ha risposto 400"),
    ]);

    const [riga] = await recentLogs();
    expect(riga.level).toBe("error");
    expect(riga.scope).toBe("assistant");
    expect(riga.message).toBe("ciclo fallito");
    expect(riga.detail).toContain("Groq ha risposto 400");
  });

  it("non lascia passare una chiave nemmeno nel dettaglio", async () => {
    await recordLog("error", ["[ai] rifiutata", "Bearer gsk_segretissima1234"]);

    const [riga] = await recentLogs();
    expect(riga.detail).not.toContain("segretissima");
  });

  // Il registro e' chiamato da `logger.error`: se scrivere fallisse e l'errore
  // uscisse, ogni guasto ne genererebbe un secondo.
  it("resta muto se il database non risponde", async () => {
    __setDbForTesting({
      ...db,
      runAsync: () => Promise.reject(new Error("disco pieno")),
    });

    await expect(recordLog("error", ["[x] boom"])).resolves.toBeUndefined();

    __setDbForTesting(db);
  });

  // Si pota ogni PRUNE_EVERY scritture, non a ogni riga: il tetto e' quello
  // piu' lo scarto fra due potature. Quel che conta e' che non cresca senza
  // fine, non che sia esattamente trecento.
  it("non cresce oltre il tetto piu' lo scarto fra due potature", async () => {
    for (let i = 0; i < MAX_LOG_ROWS * 2; i++) {
      await recordLog("warn", [`[test] riga ${i}`]);
    }

    const righe = await recentLogs(MAX_LOG_ROWS * 3);
    expect(righe.length).toBeLessThanOrEqual(MAX_LOG_ROWS + PRUNE_EVERY);
    expect(righe.length).toBeGreaterThan(MAX_LOG_ROWS - PRUNE_EVERY);
  });
});

describe("recentLogs", () => {
  it("torna dalla piu' recente", async () => {
    await recordLog("warn", ["[a] prima"]);
    await new Promise((r) => setTimeout(r, 5));
    await recordLog("error", ["[b] seconda"]);

    const righe = await recentLogs();
    expect(righe[0].message).toBe("seconda");
  });
});

describe("aiUsage", () => {
  const chiamata = async (
    tokensIn: number,
    tokensOut: number,
    cached: number | null,
    createdAt = new Date().toISOString(),
  ): Promise<void> => {
    await db.runAsync(
      `INSERT INTO ai_calls (id, capability, model, tokens_in, tokens_out,
         cached_tokens, latency_ms, success, created_at, updated_at)
       VALUES (?, 'assistant', 'gemini-3.6-flash', ?, ?, ?, 100, 1, ?, ?)`,
      [
        `c-${Math.random()}`,
        tokensIn,
        tokensOut,
        cached,
        createdAt,
        createdAt,
      ],
    );
  };

  it("somma i token e quelli serviti dalla cache", async () => {
    await chiamata(5000, 100, 4800);
    await chiamata(5600, 120, 4800);

    const usage = await aiUsage();
    expect(usage.calls).toBe(2);
    expect(usage.tokensIn).toBe(10600);
    expect(usage.tokensOut).toBe(220);
    expect(usage.cachedTokens).toBe(9600);
    expect(usage.measured).toBe(2);
  });

  // Il dato della cache e' opzionale: la trascrizione passa dall'endpoint
  // nativo, che non riporta i token affatto. "Non dichiarato" e "nessun colpo"
  // devono restare distinguibili, o una percentuale a zero direbbe le due cose
  // allo stesso modo.
  it("conta a parte le chiamate che non hanno dichiarato la cache", async () => {
    await chiamata(5000, 100, null);
    await chiamata(5000, 100, 0);

    const usage = await aiUsage();
    expect(usage.cachedTokens).toBe(0);
    expect(usage.measured).toBe(1);
  });

  it("guarda solo la finestra chiesta", async () => {
    const vecchia = new Date(Date.now() - 30 * 86_400_000).toISOString();
    await chiamata(9999, 9999, 9999, vecchia);
    await chiamata(1000, 50, 800);

    const usage = await aiUsage(7);
    expect(usage.calls).toBe(1);
    expect(usage.tokensIn).toBe(1000);
  });

  it("non inventa numeri su un registro vuoto", async () => {
    const usage = await aiUsage();
    expect(usage).toEqual({
      days: 7,
      calls: 0,
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      measured: 0,
    });
  });
});
