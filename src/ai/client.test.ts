import { RateLimitError } from "@/src/ai/errors";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

const mockNetworkState = jest.fn<Promise<unknown>, []>();
jest.mock("expo-network", () => ({
  getNetworkStateAsync: () => mockNetworkState(),
}));

type ClientModule = typeof import("@/src/ai/client");

let client: ClientModule;
let db: LocalDatabase;

const fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit]>();

/** La chiave è letta a livello di modulo: va impostata prima del primo import. */
beforeAll(() => {
  process.env.EXPO_PUBLIC_GROQ_API_KEY = "test-key";
  client = jest.requireActual<ClientModule>("@/src/ai/client");
});

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  fetchMock.mockReset();
  mockNetworkState.mockReset().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => __setDbForTesting(null));

function completion(message: unknown): Response {
  const body = { choices: [{ message }] };
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const ask = () =>
  client.chat({
    capability: "assistant",
    model: "test-model",
    messages: [{ role: "user", content: "ciao" }],
  });

const validCall = {
  id: "call-1",
  type: "function",
  function: { name: "add_food", arguments: "{}" },
};

/** Errore HTTP nudo, come lo restituisce Groq quando la quota è finita. */
function failure(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => '{"error":{"code":"rate_limit_exceeded"}}',
    json: async () => ({}),
  } as unknown as Response;
}

describe("chat: quota finita", () => {
  // Un 429 finiva in AiRequestError generico, indistinguibile da un 500 o da
  // un modello ritirato: a schermo diceva "qualcosa è andato storto" e
  // l'unica causa su cui l'utente può agire (aspettare) non era detta.
  it("distingue il 429 dagli altri errori del provider", async () => {
    fetchMock.mockResolvedValue(failure(429, { "retry-after": "12" }));

    await expect(ask()).rejects.toBeInstanceOf(RateLimitError);
  });

  it("legge Retry-After: è il solo modo di dire quanto aspettare", async () => {
    fetchMock.mockResolvedValue(failure(429, { "retry-after": "12" }));

    // Finisce anche nel messaggio, che è quello che si legge in Diagnostica.
    await expect(ask()).rejects.toMatchObject({
      retryAfterSeconds: 12,
      message: "Quota Groq esaurita, riprovare fra 12 s",
    });
  });

  it("senza Retry-After non inventa un'attesa", async () => {
    fetchMock.mockResolvedValue(failure(429));

    await expect(ask()).rejects.toMatchObject({ retryAfterSeconds: null });
  });

  it("lascia gli altri errori come sono", async () => {
    fetchMock.mockResolvedValue(failure(500));

    await expect(ask()).rejects.not.toBeInstanceOf(RateLimitError);
  });
});

describe("chat: forma dei tool call", () => {
  it("accetta un tool call completo mantenendone id, nome e argomenti", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: null, tool_calls: [validCall] }),
    );

    const response = await ask();

    expect(response.toolCalls).toEqual([
      {
        id: "call-1",
        type: "function",
        function: { name: "add_food", arguments: "{}" },
      },
    ]);
  });

  const malformedCalls: [string, unknown][] = [
    // call.function.name farebbe TypeError e ucciderebbe il turno.
    ["senza function", { id: "call-1", type: "function" }],
    // Il giro dopo partirebbe con tool_call_id undefined: 400 dal provider.
    [
      "senza id",
      { type: "function", function: { name: "add_food", arguments: "{}" } },
    ],
    // parseArguments riceverebbe un oggetto invece del JSON da parsare.
    [
      "con argomenti non stringa",
      {
        id: "call-1",
        type: "function",
        function: { name: "add_food", arguments: { g: 100 } },
      },
    ],
    // Nessun tool da cercare e nessun nome da mostrare nel messaggio d'errore.
    ["senza nome", { id: "call-1", type: "function", function: { arguments: "{}" } }],
    ["non oggetto", "add_food"],
  ];

  it.each(malformedCalls)("scarta un tool call %s", async (_label, malformed) => {
    fetchMock.mockResolvedValue(
      completion({ content: null, tool_calls: [malformed] }),
    );

    const response = await ask();

    expect(response.toolCalls).toEqual([]);
  });

  it("scarta solo l'elemento malformato e tiene gli altri", async () => {
    fetchMock.mockResolvedValue(
      completion({
        content: null,
        tool_calls: [{ id: "call-0", type: "function" }, validCall],
      }),
    );

    const response = await ask();

    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].id).toBe("call-1");
  });

  it("tratta tool_calls non array come assenza di tool call", async () => {
    fetchMock.mockResolvedValue(
      completion({ content: "ciao", tool_calls: "add_food" }),
    );

    const response = await ask();

    expect(response.toolCalls).toEqual([]);
    expect(response.content).toBe("ciao");
  });

  it("non spaccia per testo un content che non è una stringa", async () => {
    fetchMock.mockResolvedValue(completion({ content: { text: "ciao" } }));

    const response = await ask();

    expect(response.content).toBeNull();
  });
});
