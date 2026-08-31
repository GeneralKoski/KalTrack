import { listAvailableModels } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { checkModels } from "@/src/ai/health";
import { logger } from "@/src/utils/logger";

// Qui interessa la mappatura fra capability e id, non la chiamata HTTP: la
// rete e' finta come negli altri test del client.
jest.mock("@/src/ai/client", () => ({
  listAvailableModels: jest.fn(),
}));

const listing = listAvailableModels as jest.MockedFunction<
  typeof listAvailableModels
>;

beforeEach(() => {
  jest.spyOn(logger, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("checkModels", () => {
  it("segna serviti i tre modelli presenti nell'elenco", async () => {
    listing.mockResolvedValue([
      MODELS.transcription,
      MODELS.assistant,
      MODELS.vision,
      "qualcosaltro",
    ]);

    const esiti = await checkModels();
    expect(esiti.map((e) => e.capability)).toEqual([
      "transcription",
      "assistant",
      "vision",
    ]);
    expect(esiti.every((e) => e.served)).toBe(true);
  });

  // Il guasto vero: un modello non risponde e la capability e' non servita.
  it("rileva quando un modello non e' disponibile", async () => {
    listing.mockResolvedValue(["gemini-unsupported"]);

    const esiti = await checkModels();
    expect(esiti.every((e) => !e.served)).toBe(true);
  });

  it("scrive nel registro i modelli mancanti", async () => {
    listing.mockResolvedValue([]);

    await checkModels();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(MODELS.vision),
    );
  });

  it("non scrive niente nel registro se stanno tutti in piedi", async () => {
    listing.mockResolvedValue(Object.values(MODELS));

    await checkModels();

    expect(logger.error).not.toHaveBeenCalled();
  });
});
