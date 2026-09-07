import * as Speech from "expo-speech";

import { aiLanguage } from "@/src/ai/config";
import { logger } from "@/src/utils/logger";

/**
 * La voce parla la lingua dell'app, e non l'italiano fisso.
 *
 * `SPEECH_LANGUAGE = "it-IT"` era una costante: chi usava KalTrack in inglese
 * si sentiva leggere una risposta inglese con la fonetica italiana, oppure -
 * senza voce italiana installata - non si sentiva leggere niente, perché il
 * controllo cercava proprio quella.
 */

/**
 * Le voci installate non cambiano durante la sessione: la promise è memoizzata
 * per lingua, così la chiamata nativa avviene una volta sola per lingua e ogni
 * speak() successivo non paga l'enumerazione.
 */
const voiceChecks = new Map<string, Promise<boolean>>();

/** Android usa "it_IT", iOS "it-IT", alcune voci espongono solo "it". */
function matches(voiceLanguage: string, language: string): boolean {
  return voiceLanguage.toLowerCase().replace("_", "-").startsWith(language);
}

export function isVoiceAvailable(language = aiLanguage()): Promise<boolean> {
  const cached = voiceChecks.get(language);
  if (cached) return cached;

  const check = Speech.getAvailableVoicesAsync()
    .then((voices) => voices.some((voice) => matches(voice.language, language)))
    .catch((error: unknown) => {
      logger.error("[speak] elenco voci non disponibile", error);
      // L'errore può essere transitorio (motore TTS non ancora inizializzato
      // all'avvio su Android): non memoizzare il fallimento.
      voiceChecks.delete(language);
      return false;
    });

  voiceChecks.set(language, check);
  return check;
}

/**
 * Pronuncia il testo nella lingua dell'app. Ritorna false se non ha parlato:
 * senza una voce di quella lingua installata il motore ripiegherebbe su
 * un'altra leggendo con la fonetica sbagliata, quindi è meglio tacere e
 * lasciare che il chiamante mostri solo il testo.
 */
export async function speak(text: string): Promise<boolean> {
  const content = text.trim();
  if (!content) return false;

  const language = aiLanguage();
  if (!(await isVoiceAvailable(language))) return false;

  Speech.speak(content, { language });
  return true;
}

export function stopSpeaking(): void {
  Speech.stop().catch((error: unknown) => {
    logger.error("[speak] stop fallito", error);
  });
}
