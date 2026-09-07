import { transcribeAudio } from "@/src/ai/client";
import { aiLanguage, MODELS } from "@/src/ai/config";

/**
 * Un campione di contesto lessicale, non un'istruzione: il client lo passa
 * all'endpoint di trascrizione come le parole da favorire. Su clip corte di
 * dominio alimentare cambia sensibilmente il risultato - senza, "bresaola"
 * diventa "brasata", "lat machine" diventa "la maschine" e "due etti" diventa
 * "due etti" solo a volte. L'elenco resta breve di proposito: un elenco lungo
 * sposta lo stile della trascrizione invece del solo lessico.
 *
 * Uno per lingua: un elenco di parole italiane passato a una trascrizione
 * inglese non aiuta il lessico, lo sposta - e' esattamente il difetto che
 * questo campione serve a evitare.
 */
const DOMAIN_PROMPTS: Record<string, string> = {
  it:
    "Diario alimentare e palestra. Termini ricorrenti: grammi, etti, chili, " +
    "millilitri, colazione, pranzo, cena, spuntino, calorie, kcal, proteine, " +
    "carboidrati, grassi, fibre, porzione, ricetta, integratore, whey, avena, " +
    "yogurt greco, petto di pollo, riso basmati, bresaola, parmigiano, " +
    "peso, passi, allenamento, serie, ripetizioni, panca piana, lat machine.",
  en:
    "Food diary and gym log. Recurring terms: grams, kilos, millilitres, " +
    "breakfast, lunch, dinner, snack, calories, kcal, protein, carbs, fat, " +
    "fibre, serving, recipe, supplement, whey, oats, greek yoghurt, chicken " +
    "breast, basmati rice, weight, steps, workout, sets, reps, bench press, " +
    "lat pulldown, deadlift, squat.",
};

/**
 * Trascrive un file audio locale, nella lingua dell'app.
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
    language: aiLanguage(),
    prompt: DOMAIN_PROMPTS[aiLanguage()] ?? DOMAIN_PROMPTS.en,
  });
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
