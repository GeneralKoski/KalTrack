import { isAssistantUrl } from "@/src/services/assistantLaunch";

describe("riconoscimento del link dell'assistente", () => {
  it("riconosce la forma usata dalla scorciatoia", () => {
    expect(isAssistantUrl("kaltrack://assistente")).toBe(true);
  });

  it("accetta la barra finale e le maiuscole", () => {
    expect(isAssistantUrl("kaltrack://Assistente/")).toBe(true);
  });

  /** Un dev client apre l'app con un URL http: non deve far partire il microfono. */
  it("ignora gli altri link dell'app", () => {
    expect(isAssistantUrl("kaltrack://oggi")).toBe(false);
    expect(isAssistantUrl("kaltrack://profilo")).toBe(false);
    expect(isAssistantUrl("http://10.0.2.2:8081")).toBe(false);
  });

  it("non si rompe su una stringa vuota o senza schema", () => {
    expect(isAssistantUrl("")).toBe(false);
    expect(isAssistantUrl("   ")).toBe(false);
  });
});
