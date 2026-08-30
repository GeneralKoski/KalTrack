import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { runMigrations } from "@/src/db/migrations";
import { createExercise, searchExercises } from "@/src/db/queries/exercises";
import type { LocalDatabase } from "@/src/db/sqliteAdapter";
import { importCatalog, publishToCatalog } from "@/src/services/exerciseCatalog";
import { useAccountStore } from "@/src/stores/accountStore";

jest.mock("@/src/api/config", () => ({
  API_URL: "https://esempio.tld/api",
  API_TIMEOUT_MS: 1000,
  hasBackend: () => true,
}));

// Il prefisso `mock` non e' vezzo: jest.mock viene issato in cima al file e
// senza quel prefisso rifiuta di leggere una variabile dichiarata dopo.
const mockApiRequest = jest.fn();
jest.mock("@/src/api/client", () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  setAuthTokenProvider: jest.fn(),
}));

let db: LocalDatabase;

beforeEach(async () => {
  jest.clearAllMocks();
  db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
  useAccountStore.setState({ token: "token-valido", profile: null });
});

afterEach(() => __setDbForTesting(null));

const voce = (over: Record<string, unknown> = {}) => ({
  name: "Panca piana",
  nameNorm: "panca piana",
  muscleGroup: "petto",
  equipment: "bilanciere,panca",
  ...over,
});

describe("importCatalog", () => {
  it("porta nel telefono gli esercizi che qui non ci sono", async () => {
    mockApiRequest.mockResolvedValue({ data: [voce()] });

    expect(await importCatalog()).toBe(1);

    const trovati = await searchExercises({ term: "panca" });
    expect(trovati.map((e) => e.name)).toEqual(["Panca piana"]);
    // Voce di catalogo, non roba inventata da chi usa questo telefono.
    expect(trovati[0].is_custom).toBe(0);
    expect(JSON.parse(trovati[0].equipment ?? "[]")).toEqual([
      "bilanciere",
      "panca",
    ]);
  });

  /**
   * Il confronto e' sul nome normalizzato, la stessa regola con cui il server
   * tiene fuori i doppioni: gli id nascono su un telefono e sull'altro non
   * vogliono dire niente.
   */
  it("non duplica un esercizio che c'e' gia' con altre maiuscole", async () => {
    await createExercise({
      name: "panca  piana",
      muscleGroup: "petto",
      secondaryMuscles: [],
      equipment: ["bilanciere"],
    });
    mockApiRequest.mockResolvedValue({ data: [voce()] });

    expect(await importCatalog()).toBe(0);
    expect(await searchExercises({ term: "panca" })).toHaveLength(1);
  });

  /**
   * Il catalogo lo scrivono altri telefoni, magari con una versione diversa
   * dell'app: un valore che non conosciamo non deve entrare in colonna e
   * girare per l'app come se fosse buono.
   */
  it("scarta un gruppo muscolare che non esiste", async () => {
    mockApiRequest.mockResolvedValue({
      data: [voce({ muscleGroup: "branchie" })],
    });

    expect(await importCatalog()).toBe(0);
    expect(await searchExercises({ term: "panca" })).toHaveLength(0);
  });

  it("tiene solo gli attrezzi che conosce", async () => {
    mockApiRequest.mockResolvedValue({
      data: [voce({ equipment: "bilanciere,astronave" })],
    });

    await importCatalog();

    const [trovato] = await searchExercises({ term: "panca" });
    expect(JSON.parse(trovato.equipment ?? "[]")).toEqual(["bilanciere"]);
  });

  it("senza account non chiede niente al server", async () => {
    useAccountStore.setState({ token: null, profile: null });

    expect(await importCatalog()).toBe(0);
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /** Senza rete la palestra deve funzionare com'e' sempre funzionata. */
  it("un errore di rete non solleva", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    expect(await importCatalog()).toBe(0);
  });
});

describe("publishToCatalog", () => {
  it("manda nome, gruppo e attrezzi, e nient'altro", async () => {
    mockApiRequest.mockResolvedValue({ data: voce() });

    await publishToCatalog({
      name: "Panca piana",
      muscleGroup: "petto",
      equipment: ["bilanciere", "panca"],
    });

    expect(mockApiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "post",
        path: "/exercises",
        body: {
          name: "Panca piana",
          muscleGroup: "petto",
          equipment: "bilanciere,panca",
        },
      }),
    );
  });

  it("senza account non pubblica niente", async () => {
    useAccountStore.setState({ token: null, profile: null });

    await publishToCatalog({
      name: "Panca piana",
      muscleGroup: "petto",
      equipment: [],
    });

    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  /**
   * L'esercizio e' gia' salvato sul telefono quando questa parte: se il
   * catalogo non risponde, l'utente non deve vedere niente di rotto.
   */
  it("un errore di rete non solleva", async () => {
    mockApiRequest.mockRejectedValue(new Error("rete assente"));

    await expect(
      publishToCatalog({
        name: "Panca piana",
        muscleGroup: "petto",
        equipment: [],
      }),
    ).resolves.toBeUndefined();
  });
});
