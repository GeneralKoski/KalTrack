import * as Speech from "expo-speech";

import { logger } from "@/src/utils/logger";

const SPEECH_LANGUAGE = "it-IT";

/**
 * Le voci installate non cambiano durante la sessione: la promise è memoizzata
 * così la chiamata nativa avviene una volta sola e ogni speak() successivo non
 * paga l'enumerazione.
 */
let italianVoiceCheck: Promise<boolean> | null = null;

/** Android usa "it_IT", iOS "it-IT", alcune voci espongono solo "it". */
function isItalian(language: string): boolean {
  return language.toLowerCase().replace("_", "-").startsWith("it");
}

export function isItalianVoiceAvailable(): Promise<boolean> {
  if (!italianVoiceCheck) {
    italianVoiceCheck = Speech.getAvailableVoicesAsync()
      .then((voices) => voices.some((voice) => isItalian(voice.language)))
      .catch((error: unknown) => {
        logger.error("[speak] elenco voci non disponibile", error);
        // L'errore può essere transitorio (motore TTS non ancora inizializzato
        // all'avvio su Android): non memoizzare il fallimento.
        italianVoiceCheck = null;
        return false;
      });
  }
  return italianVoiceCheck;
}

/**
 * Pronuncia il testo in italiano. Ritorna false se non ha parlato: senza una
 * voce italiana installata il motore ripiegherebbe su un'altra lingua leggendo
 * l'italiano con fonetica sbagliata, quindi è meglio tacere e lasciare che il
 * chiamante mostri solo il testo.
 */
export async function speak(text: string): Promise<boolean> {
  const content = text.trim();
  if (!content) return false;
  if (!(await isItalianVoiceAvailable())) return false;

  Speech.speak(content, { language: SPEECH_LANGUAGE });
  return true;
}

export function stopSpeaking(): void {
  Speech.stop().catch((error: unknown) => {
    logger.error("[speak] stop fallito", error);
  });
}
