import {
  NEVER_AUTO_CONFIRM,
  useAssistantStore,
} from "@/src/stores/assistantStore";

beforeEach(() => {
  useAssistantStore.setState({ voiceReplyEnabled: true, autoConfirm: [] });
});

describe("auto-conferma", () => {
  it("è per capability, non globale", () => {
    const { allowAutoConfirm, isAutoConfirmed } = useAssistantStore.getState();
    allowAutoConfirm("log_steps");

    expect(useAssistantStore.getState().isAutoConfirmed("log_steps")).toBe(true);
    expect(isAutoConfirmed("add_meal_entries")).toBe(false);
  });

  it("non si accumula ripetendo la stessa scelta", () => {
    const { allowAutoConfirm } = useAssistantStore.getState();
    allowAutoConfirm("log_weight");
    allowAutoConfirm("log_weight");
    expect(useAssistantStore.getState().autoConfirm).toEqual(["log_weight"]);
  });

  it("si può revocare", () => {
    useAssistantStore.getState().allowAutoConfirm("log_steps");
    useAssistantStore.getState().revokeAutoConfirm("log_steps");
    expect(useAssistantStore.getState().isAutoConfirmed("log_steps")).toBe(false);
  });

  it("le cancellazioni non sono auto-confermabili nemmeno chiedendolo", () => {
    // La regola vive nel codice, non nei dati: nessuna scrittura nello store
    // può renderla vera.
    for (const tool of NEVER_AUTO_CONFIRM) {
      useAssistantStore.getState().allowAutoConfirm(tool);
      expect(useAssistantStore.getState().isAutoConfirmed(tool)).toBe(false);
      expect(useAssistantStore.getState().autoConfirm).not.toContain(tool);
    }
  });

  it("anche uno stato persistito corrotto non abilita le cancellazioni", () => {
    // Un file di backup manomesso, o una versione futura che cambia idea:
    // isAutoConfirmed non si fida dell'elenco salvato.
    useAssistantStore.setState({ autoConfirm: [...NEVER_AUTO_CONFIRM] });
    for (const tool of NEVER_AUTO_CONFIRM) {
      expect(useAssistantStore.getState().isAutoConfirmed(tool)).toBe(false);
    }
  });
});

describe("risposta parlata", () => {
  it("è attiva di default", () => {
    expect(useAssistantStore.getState().voiceReplyEnabled).toBe(true);
  });

  it("si può disattivare", () => {
    useAssistantStore.getState().setVoiceReplyEnabled(false);
    expect(useAssistantStore.getState().voiceReplyEnabled).toBe(false);
  });
});
