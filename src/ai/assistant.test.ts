import {
  buildCatalogMessage,
  buildStateMessage,
  buildSystemPrompt,
  intentKeyForTesting,
  MAX_TOOL_ROUNDS,
  normalizeQuantities,
  runAssistant,
} from "@/src/ai/assistant";
import {
  chat,
  type ChatMessage,
  type ChatResponse,
  type ToolCall,
} from "@/src/ai/client";
import type { AssistantContext } from "@/src/ai/assistant";
import type { ToolIntent } from "@/src/ai/tools/types";
import { createTestDb } from "@/src/db/__testing__/betterSqliteAdapter";
import { __setDbForTesting } from "@/src/db/index";
import { MEAL_TYPE_IDS, runMigrations } from "@/src/db/migrations";
import { getSteps } from "@/src/db/queries/tracking";

jest.mock("@/src/ai/client");

const chatMock = chat as jest.MockedFunction<typeof chat>;

const rawCall = (name: string, args: string, id = "call-1"): ToolCall => ({
  id,
  type: "function",
  function: { name, arguments: args },
});

const call = (name: string, args: unknown, id = "call-1"): ToolCall =>
  rawCall(name, JSON.stringify(args), id);

const answer = (
  content: string | null,
  toolCalls: ToolCall[] = [],
): ChatResponse => ({ content, toolCalls, usage: null });

const context: AssistantContext = {
  now: new Date(2026, 7, 28, 20, 41),
  screen: "Oggi",
  date: "2026-08-28",
  targets: { kcal: 2200, proteinG: 160, carbsG: 250, fatG: 70, steps: 10000 },
  consumed: { kcal: 1450, proteinG: 90, carbsG: 150, fatG: 40, steps: 6200 },
  mealTypes: [{ id: MEAL_TYPE_IDS.dinner, name: "cena" }],
  recipes: [{ id: "rec-1", name: "Iper pizza proteica" }],
  foods: [{ id: "food-1", name: "Riso" }],
  entries: [{ id: "entry-1", name: "Riso", kcal: 195 }],
};

const messagesOfCall = (index: number): ChatMessage[] => {
  const args = chatMock.mock.calls[index]?.[0];
  if (!args) throw new Error(`Chiamata ${index} mai avvenuta`);
  return args.messages;
};

const toolMessages = (index: number): string[] =>
  messagesOfCall(index)
    .filter((message) => message.role === "tool")
    .map((message) => String(message.content));

beforeEach(async () => {
  chatMock.mockReset();
  const db = createTestDb();
  await runMigrations(db);
  __setDbForTesting(db);
});

afterEach(() => __setDbForTesting(null));

describe("normalizeQuantities", () => {
  it("converte in grammi le unità italiane che il modello sbaglia", () => {
    expect(normalizeQuantities("un etto di riso")).toBe("100 g di riso");
    expect(normalizeQuantities("due etti e mezzo di pasta")).toBe(
      "250 g di pasta",
    );
    expect(normalizeQuantities("un etto e mezzo di pollo")).toBe(
      "150 g di pollo",
    );
    expect(normalizeQuantities("mezzo chilo di patate")).toBe("500 g di patate");
    expect(normalizeQuantities("un chilo di mele")).toBe("1000 g di mele");
    expect(normalizeQuantities("150 grammi di riso")).toBe("150 g di riso");
  });

  it("lavora anche a metà frase e senza badare alle maiuscole", () => {
    expect(normalizeQuantities("a pranzo Due Etti di riso e un caffè")).toBe(
      "a pranzo 200 g di riso e un caffè",
    );
  });

  it("non converte quello che è ambiguo: meglio una domanda di un numero inventato", () => {
    expect(normalizeQuantities("qualche etto di pasta")).toBe(
      "qualche etto di pasta",
    );
    expect(normalizeQuantities("un paio di etti di riso")).toBe(
      "un paio di etti di riso",
    );
    expect(normalizeQuantities("un piatto di pasta")).toBe("un piatto di pasta");
  });
});

describe("buildSystemPrompt", () => {
  // La cache del prompt di Gemini vale sul PREFISSO: il primo carattere che
  // cambia da un turno all'altro butta via tutto quello che segue. Il prompt
  // statico e' quel prefisso, quindi non deve contenere niente del contesto.
  it("e' identico a ogni turno: e' il prefisso che la cache riusa", () => {
    expect(buildSystemPrompt()).toBe(buildSystemPrompt());
  });

  it("porta le regole e nessun dato volatile", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain("RULES");
    expect(prompt).not.toContain("Now:");
    expect(prompt).not.toContain("Targets today");
  });
});

describe("buildStateMessage", () => {
  it("porta lo stato volatile: data, schermata, obiettivi e residuo", () => {
    const message = buildStateMessage(context);

    expect(message).toContain("Now: 2026-08-28 20 (venerdì)");
    expect(message).toContain("Current screen: Oggi");
    expect(message).toContain("Targets today: 2200 kcal");
    expect(message).toContain("Remaining today: 750 kcal");
  });

  // I minuti non servono a niente: `Now` risolve "oggi"/"ieri" e i giorni della
  // settimana, e l'ora basta a capire se e' cena. Cambiando ogni minuto erano
  // la garanzia che due frasi di seguito non condividessero mai il prefisso.
  it("non stampa i minuti", () => {
    expect(buildStateMessage(context)).not.toContain("20:41");
  });

  it("tiene separati oggi e il giorno sfogliato, ognuno col suo giorno della settimana", () => {
    const message = buildStateMessage({ ...context, date: "2026-08-24" });

    expect(message).toContain("Now: 2026-08-28 20 (venerdì)");
    expect(message).toContain(
      "Reference day (what the user is looking at): 2026-08-24 (lunedì)",
    );
    // La coppia data/giorno inesistente era il difetto: il 24 non è venerdì.
    expect(message).not.toContain("2026-08-24 (venerdì)");
  });

  it("elenca le voci del diario con id e kcal: sono l'unica fonte di un entryId", () => {
    const message = buildStateMessage(context);

    expect(message).toContain("entry-1 = Riso (195 kcal)");
  });

  // Il catalogo sta nel prefisso cacheato, lo stato no: se un elenco finisse
  // qui tornerebbe a costare prezzo pieno a ogni frase.
  it("non porta il catalogo: quello sta nel prefisso", () => {
    const message = buildStateMessage(context);

    expect(message).not.toContain("Most used foods");
    expect(message).not.toContain("User recipes");
  });

  it("regge un contesto minimo senza obiettivi né elenchi", () => {
    const message = buildStateMessage({ now: new Date(2026, 7, 28) });

    expect(message).toContain("Reference day");
    expect(message).toContain("2026-08-28 (venerdì)");
    expect(message).not.toContain("Targets today");
    expect(message).not.toContain("Diary entries of the reference day");
  });
});

describe("buildCatalogMessage", () => {
  it("elenca ricette e alimenti con i loro id, che è ciò che li fa agganciare", () => {
    const message = buildCatalogMessage(context);

    expect(message).toContain("rec-1 = Iper pizza proteica");
    expect(message).toContain("food-1 = Riso");
    expect(message).toContain(`${MEAL_TYPE_IDS.dinner} = cena`);
  });

  // E' l'invariante che vale il prezzo: gli alimenti arrivano ordinati per
  // utilizzi e si riordinano appena si registra un pasto. Senza ordinamento
  // stabile il prefisso cambia, la cache non colpisce e ogni frase ripaga i
  // quattromila token dei tool a prezzo pieno.
  it("è identico se cambia solo l'ordine di arrivo", () => {
    const reversed: AssistantContext = {
      ...context,
      foods: [...(context.foods ?? [])].reverse(),
      recipes: [...(context.recipes ?? [])].reverse(),
    };

    expect(buildCatalogMessage(reversed)).toBe(buildCatalogMessage(context));
  });

  it("non porta niente di volatile", () => {
    const message = buildCatalogMessage(context);

    expect(message).not.toContain("Now:");
    expect(message).not.toContain("Targets today");
  });

  // Un messaggio con la sola intestazione sarebbe prefisso sprecato.
  it("è null quando non c'è niente da elencare", () => {
    expect(buildCatalogMessage({ now: new Date(2026, 7, 28) })).toBeNull();
  });
});

describe("runAssistant", () => {
  it("risponde senza tool quando non c'è niente da fare", async () => {
    chatMock.mockResolvedValueOnce(answer("Ciao, dimmi pure."));

    const result = await runAssistant({ transcript: "ciao", context });

    expect(result).toEqual({ reply: "Ciao, dimmi pure.", intents: [] });
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  // La cache riusa il prefisso, e le definizioni dei tool stanno DOPO
  // le istruzioni nel prompt reso: se il contesto volatile vive nel messaggio
  // di sistema, ogni turno butta via anche i tool. Sta in un messaggio suo,
  // dopo, e quel che precede resta identico.
  // L'ordine e' il prezzo: sistema, catalogo, stato, frase. Il volatile in
  // mezzo spezzerebbe il prefisso e la cache non colpirebbe piu' niente.
  it("mette il prefisso stabile davanti e il volatile in fondo", async () => {
    chatMock.mockResolvedValueOnce(answer("Fatto."));

    await runAssistant({ transcript: "ciao", context });

    const messages = messagesOfCall(0);
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "user",
      "user",
    ]);
    expect(String(messages[0].content)).not.toContain("Now:");
    expect(String(messages[1].content)).toContain("YOUR LIBRARY");
    expect(String(messages[1].content)).not.toContain("Now:");
    expect(String(messages[2].content)).toContain("Now: 2026-08-28 20");
    expect(String(messages[3].content)).toBe("ciao");
  });

  // Senza catalogo il messaggio non c'e' affatto: la frase resta l'ultima.
  it("salta il catalogo quando non c'e' niente da elencare", async () => {
    chatMock.mockResolvedValueOnce(answer("Fatto."));

    await runAssistant({
      transcript: "ciao",
      context: { now: context.now },
    });

    const messages = messagesOfCall(0);
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "user"]);
    expect(String(messages[1].content)).toContain("CURRENT STATE");
    expect(String(messages[2].content)).toBe("ciao");
  });

  it("manda lo stesso messaggio di sistema a due turni con contesti diversi", async () => {
    chatMock.mockResolvedValueOnce(answer("Uno.")).mockResolvedValueOnce(answer("Due."));

    await runAssistant({ transcript: "ciao", context });
    await runAssistant({
      transcript: "ciao",
      context: { ...context, date: "2026-08-24", foods: [{ id: "food-9", name: "Pane" }] },
    });

    expect(messagesOfCall(0)[0].content).toBe(messagesOfCall(1)[0].content);
  });

  it("esegue subito un tool di lettura e restituisce il risultato al modello", async () => {
    chatMock
      .mockResolvedValueOnce(
        answer(null, [call("query_summary", { date: "2026-08-28" })]),
      )
      .mockResolvedValueOnce(answer("Ti mancano 2200 calorie."));

    const result = await runAssistant({ transcript: "quanto mi manca?", context });

    expect(toolMessages(1)[0]).toContain("Nessun obiettivo impostato");
    expect(result.reply).toBe("Ti mancano 2200 calorie.");
    expect(result.intents[0]).toMatchObject({
      toolName: "query_summary",
      executed: true,
    });
    expect(result.intents[0].result?.message).toContain("kcal");
  });

  it("non esegue un tool di scrittura: lo ritorna come intento con l'anteprima", async () => {
    chatMock
      .mockResolvedValueOnce(
        answer(null, [
          call("log_steps", { days: [{ date: "2026-08-24", steps: 8000 }] }),
        ]),
      )
      .mockResolvedValueOnce(answer("Segno 8000 passi per lunedì."));

    const intents: ToolIntent[] = [];
    const result = await runAssistant({
      transcript: "lunedì ho fatto 8000 passi",
      context,
      onToolIntent: (intent) => {
        intents.push(intent);
      },
    });

    expect(await getSteps("2026-08-24")).toBeNull();
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]).toMatchObject({
      toolName: "log_steps",
      riskLevel: "write",
      executed: false,
      result: null,
    });
    expect(result.intents[0].preview.lines).toEqual(["24/08: 8000 passi"]);
    expect(intents).toEqual(result.intents);

    // Il modello deve sapere che l'azione è pronta, altrimenti la richiama.
    expect(toolMessages(1)[0]).toContain("PREPARED");
  });

  it("manda al modello il trascritto con le quantità già in grammi", async () => {
    chatMock.mockResolvedValueOnce(answer("ok"));

    await runAssistant({ transcript: "due etti di pasta", context });

    const messages = messagesOfCall(0);
    expect(messages[messages.length - 1]).toEqual({
      role: "user",
      content: "200 g di pasta",
    });
  });

  it("senza data l'azione finisce sul giorno sfogliato, non su oggi", async () => {
    chatMock
      .mockResolvedValueOnce(answer(null, [call("log_steps", { days: [{ steps: 8000 }] })]))
      .mockResolvedValueOnce(answer("Fatto."));

    const result = await runAssistant({
      transcript: "segna 8000 passi",
      context: { ...context, date: "2026-08-24" },
    });

    expect(result.intents[0].preview.lines).toEqual(["24/08: 8000 passi"]);
  });

  it("prepara una volta sola la stessa azione, anche se il modello insiste", async () => {
    chatMock.mockResolvedValue(
      answer(null, [call("log_steps", { days: [{ date: "2026-08-24", steps: 1 }] })]),
    );

    const result = await runAssistant({ transcript: "passi", context });

    expect(chatMock).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(result.intents).toHaveLength(1);
    expect(toolMessages(MAX_TOOL_ROUNDS - 1).at(-1)).toContain("ALREADY PREPARED");
    // Con un'azione pronta sullo schermo, dire che è andata male si contraddice.
    expect(result.reply).toBe("Ho preparato: Passi. Confermi?");
  });

  it("riporta al modello gli argomenti sbagliati invece di fallire", async () => {
    chatMock
      .mockResolvedValueOnce(answer(null, [call("log_steps", { days: [] })]))
      .mockResolvedValueOnce(answer("Di che giorno parliamo?"));

    const result = await runAssistant({ transcript: "segna i passi", context });

    expect(toolMessages(1)[0]).toContain("ERROR");
    expect(result.intents).toHaveLength(0);
    expect(result.reply).toBe("Di che giorno parliamo?");
  });

  it("tratta gli argomenti vuoti come una chiamata senza argomenti", async () => {
    chatMock
      .mockResolvedValueOnce(answer(null, [rawCall("query_summary", "")]))
      .mockResolvedValueOnce(answer("Nessun obiettivo impostato."));

    const result = await runAssistant({ transcript: "come sto andando?", context });

    expect(toolMessages(1)[0]).not.toContain("ERROR");
    expect(result.intents[0]).toMatchObject({
      toolName: "query_summary",
      executed: true,
    });
  });

  it("dice al modello quando gli argomenti non sono JSON", async () => {
    chatMock
      .mockResolvedValueOnce(answer(null, [rawCall("query_summary", "{oops")]))
      .mockResolvedValueOnce(answer("Riprovo."));

    const result = await runAssistant({ transcript: "riepilogo", context });

    expect(toolMessages(1)[0]).toContain("not valid JSON");
    expect(result.intents).toHaveLength(0);
  });

  it("scarta un tool call senza id invece di lasciarlo senza risposta", async () => {
    chatMock.mockResolvedValueOnce(
      answer("Ok.", [call("query_summary", { date: "2026-08-28" }, "")]),
    );

    const result = await runAssistant({ transcript: "riepilogo", context });

    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(result.intents).toHaveLength(0);
    expect(result.reply).toBe("Ok.");
  });

  it("sopravvive a un tool inventato dal modello", async () => {
    chatMock
      .mockResolvedValueOnce(answer(null, [call("cook_dinner", {})]))
      .mockResolvedValueOnce(answer("Non so farlo."));

    const result = await runAssistant({ transcript: "cucina", context });

    expect(toolMessages(1)[0]).toContain("unknown tool");
    expect(result.reply).toBe("Non so farlo.");
  });

  it("passa i tool al client e il transcript come messaggio utente", async () => {
    chatMock.mockResolvedValueOnce(answer("ok"));

    await runAssistant({ transcript: "ciao", context });

    const args = chatMock.mock.calls[0][0];
    expect(args.capability).toBe("assistant");
    expect(args.tools?.length).toBeGreaterThan(0);
    expect(args.messages[args.messages.length - 1]).toEqual({
      role: "user",
      content: "ciao",
    });
  });
});

describe("normalizeQuantities e il peso corporeo", () => {
  /**
   * Il difetto che questo test blocca: "peso 80 kg" diventava "peso 80000 g",
   * e al modello arrivava un peso corporeo in grammi.
   */
  it("non converte i chili di una pesata", () => {
    expect(normalizeQuantities("peso 80 kg")).toBe("peso 80 kg");
    expect(normalizeQuantities("stamattina pesavo 78,5 kg")).toBe(
      "stamattina pesavo 78,5 kg",
    );
    expect(normalizeQuantities("la bilancia segna 80 kg")).toBe(
      "la bilancia segna 80 kg",
    );
  });

  it("continua a convertire le quantita' di cibo", () => {
    expect(normalizeQuantities("due etti di riso")).toBe("200 g di riso");
    expect(normalizeQuantities("mezzo chilo di pane")).toContain("500 g");
  });

  /** "peso" lontano dalla quantita' non e' una pesata. */
  it("converte quando il peso e' un'altra frase", () => {
    expect(
      normalizeQuantities(
        "il peso non lo ricordo, comunque ho mangiato due etti di pasta",
      ),
    ).toContain("200 g");
  });
});

describe("chiave di un intento", () => {
  /**
   * Il difetto che questo test blocca: la chiave usava JSON.stringify, che
   * conserva l'ordine di inserimento. Lo stesso intento riscritto dal modello
   * con i campi in un altro ordine passava il controllo dei duplicati e
   * scriveva la voce due volte.
   */
  it("non cambia se i campi arrivano in un altro ordine", () => {
    const a = { date: "2026-08-29", mealTypeId: "mt-lunch", entries: [] };
    const b = { entries: [], mealTypeId: "mt-lunch", date: "2026-08-29" };
    expect(intentKeyForTesting("add_meal_entries", a)).toBe(
      intentKeyForTesting("add_meal_entries", b),
    );
  });

  it("resta diversa quando i valori sono diversi", () => {
    expect(intentKeyForTesting("log_steps", { steps: 1000 })).not.toBe(
      intentKeyForTesting("log_steps", { steps: 2000 }),
    );
  });

  it("ignora i campi esplicitamente indefiniti", () => {
    expect(
      intentKeyForTesting("log_weight", { weightKg: 80, bodyFatPct: undefined }),
    ).toBe(intentKeyForTesting("log_weight", { weightKg: 80 }));
  });
});
