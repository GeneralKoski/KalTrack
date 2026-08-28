import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";

import { logger } from "@/src/utils/logger";

export type VoiceRecordingError = "permission-denied" | "recording-failed";

export interface VoiceRecording {
  isRecording: boolean;
  /** Uri dell'ultima registrazione conclusa, null finché non se ne chiude una. */
  uri: string | null;
  error: VoiceRecordingError | null;
  /**
   * Livello audio corrente normalizzato 0..1 per l'onda a schermo, null quando
   * la piattaforma non riporta il metering: null lascia decidere alla UI, uno
   * zero fisso la farebbe disegnare un silenzio che non è stato misurato.
   */
  level: number | null;
  start: () => Promise<void>;
  /** Ritorna l'uri del file appena registrato, o null se non c'è. */
  stop: () => Promise<string | null>;
}

/**
 * Il preset HIGH_QUALITY produce .m4a su entrambe le piattaforme, che è il
 * formato con cui il client carica il file verso Whisper; LOW_QUALITY su
 * Android scriverebbe un .3gp con un nome e un mime type sbagliati.
 */
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

/** Sotto questa soglia in dBFS si considera silenzio ai fini dell'onda. */
const SILENCE_DB = -60;

/** Abbastanza fitto da animare l'onda senza far girare il polling a vuoto. */
const STATE_POLL_MS = 100;

/**
 * Il tipo di expo-audio dichiara `metering?: number`, ma il valore arriva dal
 * nativo e può essere null: con `=== undefined` il null passava e
 * (null + 60) / 60 dà 1, cioè un'onda al massimo fissa. Il confronto lasco
 * `== null` copre entrambi, non stringerlo.
 */
function normalizeLevel(metering: number | null | undefined): number | null {
  if (metering == null || Number.isNaN(metering)) return null;
  const ratio = (metering - SILENCE_DB) / -SILENCE_DB;
  return Math.min(1, Math.max(0, ratio));
}

async function ensureMicrophonePermission(): Promise<boolean> {
  const current = await getRecordingPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await requestRecordingPermissionsAsync();
  return requested.granted;
}

export function useVoiceRecording(): VoiceRecording {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, STATE_POLL_MS);
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<VoiceRecordingError | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      // Il recorder viene rilasciato dal suo hook allo smontaggio, ma se la
      // schermata sparisce a registrazione aperta il microfono resterebbe
      // acceso fino al rilascio: chiuderla esplicitamente. Dopo il rilascio
      // stop() può rifiutare, e a quel punto non c'è più nulla da fare.
      if (recorder.isRecording) {
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder]);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (!(await ensureMicrophonePermission())) {
        if (mounted.current) setError("permission-denied");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!mounted.current) return;
      setUri(null);
      recorder.record();
    } catch (cause) {
      logger.error("[voice] avvio registrazione fallito", cause);
      if (mounted.current) setError("recording-failed");
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
      const recorded = recorder.uri;
      if (mounted.current) setUri(recorded);
      return recorded;
    } catch (cause) {
      logger.error("[voice] stop registrazione fallito", cause);
      if (mounted.current) setError("recording-failed");
      return null;
    } finally {
      // Su iOS lasciare la sessione in modalità registrazione abbassa il volume
      // della riproduzione successiva, quindi anche della sintesi vocale.
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, [recorder]);

  return {
    isRecording: state.isRecording,
    uri,
    error,
    level: state.isRecording ? normalizeLevel(state.metering) : null,
    start,
    stop,
  };
}
