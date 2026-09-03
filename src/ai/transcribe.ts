import { transcribeAudio } from "@/src/ai/client";
import { MODELS, TRANSCRIPTION_LANGUAGE } from "@/src/ai/config";

/**
 * Un campione di contesto lessicale, non un'istruzione: il client lo passa
 * all'endpoint di trascrizione come le parole da favorire. Su clip corte di
 * dominio alimentare cambia sensibilmente il risultato - senza, "bresaola"
 * diventa "brasata", "lat machine" diventa "la maschine" e "due etti" diventa
 * "due etti" solo a volte. L'elenco resta breve di proposito: un elenco lungo
 * sposta lo stile della trascrizione invece del solo lessico.
 */
const DOMAIN_PROMPT =
  "Diario alimentare e palestra. Termini ricorrenti: grammi, etti, chili, " +
  "millilitri, colazione, pranzo, cena, spuntino, calorie, kcal, proteine, " +
  "carboidrati, grassi, fibre, porzione, ricetta, integratore, whey, avena, " +
  "yogurt greco, petto di pollo, riso basmati, bresaola, parmigiano, " +
  "peso, passi, allenamento, serie, ripetizioni, panca piana, lat machine.";

/**
 * Trascrive un file audio locale in testo italiano.
 *
 * Ritorna null quando non è stato riconosciuto nessun parlato (registrazione
 * di silenzio, tasto premuto per sbaglio): è un esito legittimo, diverso dalla
 * risposta malformata che il client traduce in AiResponseError. Il tipo
 * nullable è voluto e non va tolto: un "" restituito come stringa qualunque
 * finirebbe all'assistente come messaggio utente vuoto, spendendo una chat
 * completion per non dire nulla.
 */
export async function transcribeVoice(uri: string): Promise<string | null> {
  const text = await transcribeAudio({
    capability: "transcription",
    model: MODELS.transcription,
    uri,
    language: TRANSCRIPTION_LANGUAGE,
    prompt: DOMAIN_PROMPT,
  });
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
