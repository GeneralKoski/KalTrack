/**
 * Normalizzazione per ricerca e matching: minuscolo, senza accenti, senza
 * punteggiatura, spazi compressi. Usata sia dalla ricerca alimenti sia (in
 * Fase 2) dal matching degli alimenti dettati a voce.
 *
 * Serve perché LIKE di SQLite è case-insensitive solo su ASCII: senza questa
 * colonna normalizzata, cercare "caffe" non troverebbe mai "Caffè".
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
