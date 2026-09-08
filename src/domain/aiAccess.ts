/**
 * Se l'AI si puo' usare su questo telefono, adesso.
 *
 * Funzione pura e in un posto solo di proposito: la condizione la leggono
 * tutti i punti d'ingresso, e copie separate sono occasioni di divergere.
 *
 * `aiEnabled` e' l'ULTIMO VALORE NOTO, non la verita' del momento: il profilo
 * non e' persistito e offline non c'e'. `null` vuol dire "non lo so ancora", e
 * si decide in favore dell'utente - negare il diritto per ignoranza lo
 * negherebbe a chi paga, e questo cancello non e' una serratura (§ AI): non
 * apre niente che il server non conceda comunque.
 *
 * `isHydrated` e' la stessa regola applicata al TOKEN: `restore()` legge
 * SecureStore in modo asincrono, quindi per una finestra reale all'avvio
 * `token` e' `null` senza che questo dica ancora niente su un account - dice
 * solo che non si e' ancora finito di leggere. Trattare quel `null` come
 * "nessun account" mandava un utente con diritto, su un deep link a freddo,
 * alla pagina dei piani: lo stesso difetto che la regola su `aiEnabled` esiste
 * per impedire, spostato di una variabile. Finche' `isHydrated` e' falso non
 * si sa NIENTE, ne' del token ne' del diritto, e "non lo so ancora" vince
 * anche qui.
 */
export function aiAvailable(stato: {
  token: string | null;
  aiEnabled: boolean | null;
  isHydrated: boolean;
}): boolean {
  if (!stato.isHydrated) return true;
  if (!stato.token) return false;
  return stato.aiEnabled !== false;
}
