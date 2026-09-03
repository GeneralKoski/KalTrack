import { useAssistantStore } from "@/src/stores/assistantStore";

beforeEach(() => {
  useAssistantStore.setState({ voiceReplyEnabled: true });
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
