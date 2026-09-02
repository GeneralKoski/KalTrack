import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";

/**
 * Il client interroga expo-network solo per capire se un fetch fallito è
 * "sei offline" o "il provider non risponde": qui lo stato è pilotato a mano
 * perché sotto jest il modulo nativo non risponde nulla.
 */
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(async () => "bW9ja2VkLWF1ZGlvLWJhc2U2NA=="),
  EncodingType: { Base64: "base64" },
}));

const mockNetworkState = jest.fn<Promise<unknown>, []>();
jest.mock("expo-network", () => ({
  getNetworkStateAsync: () => mockNetworkState(),
}));

type TranscribeModule = typeof import("@/src/ai/transcribe");
type ConfigModule = typeof import("@/src/ai/config");
type ErrorsModule = typeof import("@/src/ai/errors");

let transcribe: TranscribeModule;
let config: ConfigModule;
let errors: ErrorsModule;
let db: LocalDatabase;

const fetchMock = jest.fn<Promise<Response>, [RequestInfo, RequestInit]>();

/**
 * La chiave viene letta a livello di modulo da config.ts, quindi va impostata
 * prima del primo import: per questo i moduli sotto test si caricano qui e non
 * con un import statico in testa al file.
 */
beforeAll(() => {
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = "test-key";
  transcribe = jest.requireActual<TranscribeModule>("@/src/ai/transcribe");
  config = jest.requireActual<ConfigModule>("@/src/ai/config");
  errors = jest.requireActual<ErrorsModule>("@/src/ai/errors");
});

beforeEach(async () => {
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  fetchMock.mockReset();
  mockNetworkState.mockReset();
  // Default: rete presente, cosi solo i test che lo vogliono vedono OfflineError.
  mockNetworkState.mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => __setDbForTesting(null));

function geminiAudioResponse(text: string, status = 200): Response {
  const body = {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("transcribeVoice", () => {
  it("invia l'audio in base64 a Gemini con prompt di contesto", async () => {
    fetchMock.mockResolvedValue(geminiAudioResponse("due etti di riso"));

    const text = await transcribe.transcribeVoice("file:///audio.m4a");

    expect(text).toBe("due etti di riso");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      `${config.GEMINI_NATIVE_BASE_URL}/models/${config.MODELS.transcription}:generateContent`,
    );
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.contents[0].parts[0].inlineData.mimeType).toBe(
      "audio/m4a",
    );
    expect(parsedBody.contents[0].parts[1].text).toContain("etti");
  });

  it("ripulisce gli spazi attorno alla trascrizione", async () => {
    fetchMock.mockResolvedValue(geminiAudioResponse("  cento grammi  \n"));

    await expect(transcribe.transcribeVoice("file:///a.m4a")).resolves.toBe(
      "cento grammi",
    );
  });

  it("ritorna null quando non c'è parlato, senza spacciarlo per testo", async () => {
    fetchMock.mockResolvedValue(geminiAudioResponse("   \n "));

    await expect(
      transcribe.transcribeVoice("file:///a.m4a"),
    ).resolves.toBeNull();
  });

  it("rifiuta un 200 senza campo text invece di trascrivere il vuoto", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "quota" }));

    await expect(
      transcribe.transcribeVoice("file:///a.m4a"),
    ).rejects.toBeInstanceOf(errors.AiResponseError);
  });

  it("registra come fallita la chiamata con body inatteso", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "quota" }));

    await expect(transcribe.transcribeVoice("file:///a.m4a")).rejects.toThrow();

    const rows = await db.getAllAsync<{ success: number }>(
      "SELECT success FROM ai_calls",
    );
    expect(rows).toEqual([{ success: 0 }]);
  });

  it("traduce un fetch fallito senza rete in OfflineError", async () => {
    mockNetworkState.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      transcribe.transcribeVoice("file:///a.m4a"),
    ).rejects.toBeInstanceOf(errors.OfflineError);
  });

  it("non spaccia per offline un fetch fallito con la rete attiva", async () => {
    mockNetworkState.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    const cause = new TypeError("Network request failed");
    fetchMock.mockRejectedValue(cause);

    await expect(transcribe.transcribeVoice("file:///a.m4a")).rejects.toBe(
      cause,
    );
  });

  it("traduce l'abort del timeout in AiRequestError, non in OfflineError", async () => {
    const abort = new Error("Aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValue(abort);

    const failure = transcribe.transcribeVoice("file:///a.m4a");

    await expect(failure).rejects.toBeInstanceOf(errors.AiRequestError);
    await expect(failure).rejects.not.toBeInstanceOf(errors.OfflineError);
  });

  it("traduce un errore HTTP in AiRequestError con lo status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "too large" }, 413));

    const failure = transcribe.transcribeVoice("file:///audio.m4a");

    await expect(failure).rejects.toBeInstanceOf(errors.AiRequestError);
    await expect(failure).rejects.toMatchObject({ status: 413 });
  });

  it("registra la chiamata fallita in ai_calls", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "nope" }, 500));

    await expect(
      transcribe.transcribeVoice("file:///audio.m4a"),
    ).rejects.toThrow();

    const rows = await db.getAllAsync<{ success: number; capability: string }>(
      "SELECT success, capability FROM ai_calls",
    );
    expect(rows).toEqual([{ success: 0, capability: "transcription" }]);
  });
});
