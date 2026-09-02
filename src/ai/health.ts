import { listAvailableModels } from "@/src/ai/client";
import { MODELS } from "@/src/ai/config";
import { logger } from "@/src/utils/logger";

/** Le tre capability che dipendono da un model id, e non di piu'. */
const CONTROLLATE = ["transcription", "assistant", "vision"] as const;

export type CheckedCapability = (typeof CONTROLLATE)[number];

export interface ModelCheck {
  capability: CheckedCapability;
  model: string;
  /** `true` se Gemini sta ancora servendo quell'id a questa chiave. */
  served: boolean;
}

/**
 * Dice quali dei tre model id Gemini sta ancora servendo.
 *
 * E' il controllo che mancava. Un modello ritirato non degrada: torna 404 e la
 * capability muore mentre chiave, rete e audio funzionano - ed e' cosi' che il
 * modello delle foto e' rimasto rotto sei settimane, perche' l'unico modo di
 * accorgersene era provare a fotografare un piatto.
 *
 * Non prova che una capability funzioni: prova che il suo modello esista. Sono
 * due cose diverse e questa e' quella che si e' rotta due volte.
 */
export async function checkModels(): Promise<ModelCheck[]> {
  const serviti = new Set(await listAvailableModels());

  const esiti = CONTROLLATE.map((capability) => {
    const model = MODELS[capability];
    const isServed =
      serviti.has(model) ||
      serviti.has(`models/${model}`) ||
      serviti.has(model.replace(/^models\//, ""));
    return {
      capability,
      model,
      served: isServed,
    };
  });

  const mancanti = esiti.filter((esito) => !esito.served);
  if (mancanti.length > 0) {
    logger.error(
      `[ai] modelli non più disponibili su Google AI Studio: ${mancanti
        .map((esito) => `${esito.capability}=${esito.model}`)
        .join(", ")}`,
    );
  }

  return esiti;
}
