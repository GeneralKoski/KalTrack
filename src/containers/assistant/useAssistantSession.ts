import { runAssistant, type AssistantContext } from "@/src/ai/assistant";
import { hasGroqKey } from "@/src/ai/config";
import {
  MissingApiKeyError,
  OfflineError,
  RateLimitError,
} from "@/src/ai/errors";
import { speak, stopSpeaking } from "@/src/ai/speak";
import type { ToolIntent } from "@/src/ai/tools/types";
import { transcribeVoice } from "@/src/ai/transcribe";
import { useOnlineStatus } from "@/src/hooks/useOnlineStatus";
import { useVoiceRecording } from "@/src/hooks/useVoiceRecording";
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
  | "rate-limit"
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
  cancelListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  submitText: (text: string) => Promise<void>;
  /** Toglie un intento da `pending`, dopo averlo eseguito o scartato. */
  resolvePending: (intent: ToolIntent) => void;
  reset: () => void;
}

/**
 * Il ciclo dell'assistente: audio o testo, trascrizione/parsing, ragionamento, conferma.
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

  // Consumato l'ultimo intento in attesa, non c'e' piu' niente da confermare:
  // restare in "confirming" mostrerebbe una schermata di conferma vuota.
  useEffect(() => {
    setPhase((current) =>
      current === "confirming" && pending.length === 0 ? "done" : current,
    );
  }, [pending]);

  const fail = useCallback((reason: AssistantFailure) => {
    setFailure(reason);
    setPhase("error");
  }, []);

  const reset = useCallback(() => {
    // Invalida il turno in volo: quel che tornera' dal modello non deve
    // riempire una sessione che l'utente ha gia' chiuso.
    turnRef.current++;
    stopSpeaking();
    // Il microfono va spento QUI: chiudendo l'assistente mentre registrava, il
    // registratore restava avviato e il tentativo successivo falliva in
    // silenzio, lasciando l'utente in ascolto di un microfono spento.
    void recording.cancel();
    setPhase("idle");
    setTranscript("");
    setReply("");
    setPending([]);
    setExecuted([]);
    setFailure(null);
    setSpokenReplyUnavailable(false);
  }, [recording]);

  const cancelListening = useCallback(async () => {
    turnRef.current++;
    await recording.cancel();
    setPhase("idle");
    setFailure(null);
  }, [recording]);

  const startListening = useCallback(async () => {
    reset();
    // I due controlli che non richiedono di sprecare una registrazione.
    if (!hasGroqKey()) return fail("no-key");
    if (!online) return fail("offline");

    setPhase("listening");
    // Se il microfono non parte - permesso negato, registratore occupato - va
    // detto: senza questo la schermata restava in ascolto per sempre di
    // qualcosa che non stava registrando.
    if (!(await recording.start())) return fail("permission");
  }, [fail, online, recording, reset]);

  /**
   * Toglie un intento dalla lista di quelli in attesa, eseguito o scartato.
   *
   * Senza questo, confermare una delle azioni proposte chiudeva tutto e le
   * altre sparivano senza che nessuno le avesse decise; e un'azione gia'
   * partita da sola perche' auto-confermata restava a schermo col suo tasto
   * Conferma, che la eseguiva una seconda volta.
   */
  const resolvePending = useCallback((intent: ToolIntent) => {
    setPending((current) => current.filter((item) => item !== intent));
  }, []);

  /**
   * Numero del turno in corso.
   *
   * Trascrizione e risposta del modello durano secondi, e in quei secondi
   * l'utente puo' chiudere l'assistente e riaprirlo. Senza questo contatore la
   * risposta del turno abbandonato arrivava comunque e scriveva la sua
   * trascrizione, la sua risposta e le sue azioni sopra quelle del turno nuovo.
   */
  const turnRef = useRef(0);

  const stopListening = useCallback(async () => {
    const turn = ++turnRef.current;
    const stale = () => turnRef.current !== turn;

    const uri = await recording.stop();
    if (stale()) return;
    if (!uri) return fail("permission");

    setPhase("transcribing");
    try {
      const heard = await transcribeVoice(uri);
      if (stale()) return;
      if (!heard || heard.trim() === "") return fail("no-speech");
      setTranscript(heard);

      setPhase("thinking");
      const result = await runAssistant({
        transcript: heard,
        context: contextRef.current(),
      });
      if (stale()) return;

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
      if (stale()) return;
      if (error instanceof MissingApiKeyError) return fail("no-key");
      if (error instanceof OfflineError) return fail("offline");
      if (error instanceof RateLimitError) return fail("rate-limit");
      logger.error("[assistant] ciclo fallito", error);
      fail("failed");
    }
  }, [fail, recording, voiceReplyEnabled]);

  const submitText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      turnRef.current++;
      await recording.cancel();
      stopSpeaking();
      setFailure(null);

      if (!hasGroqKey()) return fail("no-key");
      if (!online) return fail("offline");

      const turn = turnRef.current;
      const stale = () => turnRef.current !== turn;

      setTranscript(trimmed);
      setPhase("thinking");
      setPending([]);
      setExecuted([]);

      try {
        const result = await runAssistant({
          transcript: trimmed,
          context: contextRef.current(),
        });
        if (stale()) return;

        setReply(result.reply);
        setExecuted(result.intents.filter((i) => i.executed));
        const writes = result.intents.filter((i) => !i.executed);
        setPending(writes);
        setPhase(writes.length > 0 ? "confirming" : "done");

        if (voiceReplyEnabled && result.reply) {
          const spoken = await speak(result.reply);
          if (!spoken) setSpokenReplyUnavailable(true);
        }
      } catch (error) {
        if (stale()) return;
        if (error instanceof MissingApiKeyError) return fail("no-key");
        if (error instanceof OfflineError) return fail("offline");
        if (error instanceof RateLimitError) return fail("rate-limit");
        logger.error("[assistant] ciclo testuale fallito", error);
        fail("failed");
      }
    },
    [fail, online, recording, voiceReplyEnabled],
  );

  return {
    phase,
    level: recording.level,
    transcript,
    reply,
    pending,
    executed,
    failure,
    spokenReplyUnavailable,
    cancelListening,
    startListening,
    stopListening,
    submitText,
    resolvePending,
    reset,
  };
}
