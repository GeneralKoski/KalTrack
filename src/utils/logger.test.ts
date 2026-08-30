import { logger, setLogSink } from "@/src/utils/logger";

const raccolte: { level: string; parts: unknown[] }[] = [];

beforeEach(() => {
  raccolte.length = 0;
  setLogSink((level, parts) => raccolte.push({ level, parts }));
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setLogSink(null);
  jest.restoreAllMocks();
});

describe("logger", () => {
  it("manda al registro warn ed error, con tutti gli argomenti", () => {
    const guasto = new Error("400");
    logger.error("[assistant] ciclo fallito", guasto);
    logger.warn("[sync] riprovo");

    expect(raccolte).toEqual([
      { level: "error", parts: ["[assistant] ciclo fallito", guasto] },
      { level: "warn", parts: ["[sync] riprovo"] },
    ]);
  });

  // Il registro serve a ritrovare i guasti: riempirlo di righe informative lo
  // renderebbe illeggibile e mangerebbe il tetto delle righe tenute.
  it("non registra log, info e debug", () => {
    logger.info("[db] schema alla versione 9");
    logger.log("ciao");
    logger.debug("dettaglio");

    expect(raccolte).toHaveLength(0);
  });

  it("continua a scrivere in console quando il registro non c'e'", () => {
    setLogSink(null);
    expect(() => logger.error("[x] boom")).not.toThrow();
    expect(console.error).toHaveBeenCalledWith("[x] boom");
  });
});
