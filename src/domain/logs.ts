import type { AppLog, LogLevel } from "@/src/db/queries/logs";

/** Lo stesso guasto, quante volte e' successo e quando. */
export interface LogGroup {
  /** Identita' del gruppo: livello, scope e messaggio insieme. */
  key: string;
  level: LogLevel;
  scope: string | null;
  message: string;
  /** Il dettaglio dell'occorrenza PIU' RECENTE: vedi la nota sotto. */
  detail: string | null;
  count: number;
  /** La prima volta che e' successo, fra quelle ancora in registro. */
  firstAt: string;
  lastAt: string;
}

/**
 * Raccoglie le righe uguali in un gruppo solo.
 *
 * Un guasto che si ripete riempie il registro di righe identiche: il blocco
 * della sincronizzazione del 6 settembre 2026 ne ha scritte ventinove, e per
 * capire che erano sempre la stessa cosa bisognava scorrerle tutte. Contate,
 * diventano una riga che dice "ventinove volte, l'ultima poco fa" - che e'
 * l'informazione che si cercava.
 *
 * **Si raggruppa su tutto l'elenco, non solo sulle righe adiacenti.** Un guasto
 * che torna ogni quarto d'ora ha in mezzo le righe di tutto il resto, e
 * raggruppare solo i vicini non ne unirebbe nemmeno due. La coppia
 * `firstAt`/`lastAt` e' quel che restituisce il senso del tempo perso per
 * strada: un gruppo che va da ieri sera a poco fa e' un guasto ancora aperto,
 * uno che finisce tre giorni fa e' storia.
 *
 * **Il dettaglio tenuto e' quello dell'ultima volta**, non del primo: e' quello
 * che descrive lo stato in cui l'app si trova adesso. Gli altri si perdono, ed
 * e' il prezzo dichiarato del raggruppamento - il file condiviso da
 * `shareLogReport` continua a portarli tutti.
 *
 * L'ordine e' per `lastAt` decrescente: quel che e' successo poco fa sta in
 * cima, come nell'elenco non raggruppato.
 */
export function groupLogs(logs: AppLog[]): LogGroup[] {
  const byKey = new Map<string, LogGroup>();

  for (const log of logs) {
    const key = `${log.level}|${log.scope ?? ""}|${log.message}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        key,
        level: log.level,
        scope: log.scope,
        message: log.message,
        detail: log.detail,
        count: 1,
        firstAt: log.createdAt,
        lastAt: log.createdAt,
      });
      continue;
    }

    existing.count++;
    // L'elenco arriva dal piu' recente, ma non si da' per scontato: chi
    // raggruppa una lista in un altro ordine deve ottenere lo stesso risultato.
    if (log.createdAt > existing.lastAt) {
      existing.lastAt = log.createdAt;
      existing.detail = log.detail;
    }
    if (log.createdAt < existing.firstAt) existing.firstAt = log.createdAt;
  }

  return [...byKey.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
