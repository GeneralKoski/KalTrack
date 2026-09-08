/**
 * Se l'AI si puo' usare su questo telefono, adesso.
 *
 * Funzione pura e in un posto solo di proposito: la condizione la leggono
 * cinque punti d'ingresso, e cinque copie sono cinque occasioni di divergere.
 *
 * `aiEnabled` e' l'ULTIMO VALORE NOTO, non la verita' del momento: il profilo
 * non e' persistito e offline non c'e'. `null` vuol dire "non lo so ancora", e
 * si decide in favore dell'utente - negare il diritto per ignoranza lo
 * negherebbe a chi paga, e questo cancello non e' una serratura (§ AI): non
 * apre niente che il server non conceda comunque.
 */
export function aiAvailable(stato: {
  token: string | null;
  aiEnabled: boolean | null;
}): boolean {
  if (!stato.token) return false;
  return stato.aiEnabled !== false;
}
