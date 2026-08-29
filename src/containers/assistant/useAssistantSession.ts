import { runAssistant, type AssistantContext } from "@/src/ai/assistant";
import { hasGroqKey } from "@/src/ai/config";
import { MissingApiKeyError, OfflineError } from "@/src/ai/errors";
import { speak, stopSpeaking } from "@/src/ai/speak";
import type { ToolIntent } from "@/src/ai/tools/types";
import { transcribeVoice } from "@/src/ai/transcribe";
import { useVoiceRecording } from "@/src/hooks/useVoiceRecording";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";
import { useAssistantStore } from "@/src/stores/assistantStore";
import { logger } from "@/src/utils/logger";
import { useCallback, useEffect, useRef, useState } from "react";

export type AssistantPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "confirming"
  | "done"
  | "error";

export type AssistantFailure =
  | "no-key"
  | "offline"
  | "no-speech"
  | "permission"
  | "failed";

export interface AssistantSession {
  phase: AssistantPhase;
  level: number | null;
  transcript: string;
  reply: string;
  /** Intenti di scrittura in attesa di conferma. */
  pending: ToolIntent[];
  /** Intenti già eseguiti: letture e navigazione. */
  executed: ToolIntent[];
  failure: AssistantFailure | null;
  /** Vero quando la voce c'è ma il dispositivo non ha una voce italiana. */
  spokenReplyUnavailable: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  reset: () => void;
}

/**
 * Il ciclo dell'assistente: audio, trascrizione, ragionamento, conferma.
 *
 * Tiene fuori dalla UI tutto ciò che non è resa: la schermata mostra una fase
 * e basta, e il ciclo resta testabile e riusabile da un'altra superficie.
 */
export function useAssistantSession(
  buildContext: () => AssistantContext,
): AssistantSession {
  const recording = useVoiceRecording();
  const online = useOnlineStatus();
  const voiceReplyEnabled = useAssistantStore((s) => s.voiceReplyEnabled);

  const [phase, setPhase] = useState<AssistantPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState<ToolIntent[]>([]);
  const [executed, setExecuted] = useState<ToolIntent[]>([]);
  const [failure, setFailure] = useState<AssistantFailure | null>(null);
  const [spokenReplyUnavailable, setSpokenReplyUnavailable] = useState(false);

  const contextRef = useRef(buildContext);
  contextRef.current = buildContext;

  useEffect(
    () => () => {
      stopSpeaking();
    },
    [],
  );

  const fail = useCallback((reason: AssistantFailure) => {
    setFailure(reason);
    setPhase("error");
  }, []);

  const reset = useCallback(() => {
    stopSpeaking();
    setPhase("idle");
    setTranscript("");
    setReply("");
    setPending([]);
    setExecuted([]);
    setFailure(null);
    setSpokenReplyUnavailable(false);
  }, []);

  const startListening = useCallback(async () => {
    reset();
    // I due controlli che non richiedono di sprecare una registrazione.
    if (!hasGroqKey()) return fail("no-key");
    if (!online) return fail("offline");

    setPhase("listening");
    await recording.start();
  }, [fail, online, recording, reset]);

  const stopListening = useCallback(async () => {
    const uri = await recording.stop();
    if (!uri) return fail("permission");

    setPhase("transcribing");
    try {
      const heard = await transcribeVoice(uri);
      if (!heard || heard.trim() === "") return fail("no-speech");
      setTranscript(heard);

      setPhase("thinking");
      const result = await runAssistant({
        transcript: heard,
        context: contextRef.current(),
      });

      setReply(result.reply);
      setExecuted(result.intents.filter((i) => i.executed));
      const writes = result.intents.filter((i) => !i.executed);
      setPending(writes);
      setPhase(writes.length > 0 ? "confirming" : "done");

      if (voiceReplyEnabled && result.reply) {
        // `speak` ritorna falso se manca la voce italiana: in quel caso il
        // testo a schermo resta l'unico canale, e va detto invece di lasciare
        // l'utente a chiedersi perché non ha parlato.
        const spoken = await speak(result.reply);
        if (!spoken) setSpokenReplyUnavailable(true);
      }
    } catch (error) {
      if (error instanceof MissingApiKeyError) return fail("no-key");
      if (error instanceof OfflineError) return fail("offline");
      logger.error("[assistant] ciclo fallito", error);
      fail("failed");
    }
  }, [fail, recording, voiceReplyEnabled]);

  return {
    phase,
    level: recording.level,
    transcript,
    reply,
    pending,
    executed,
    failure,
    spokenReplyUnavailable,
    startListening,
    stopListening,
    reset,
  };
}
