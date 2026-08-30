import {
  recentFailedAiCalls,
  recentLogs,
  type AppLog,
  type FailedAiCall,
} from "@/src/db/queries/logs";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const riga = (log: AppLog): string =>
  [
    `${log.createdAt} ${log.level.toUpperCase()} ${log.scope ? `[${log.scope}] ` : ""}${log.message}`,
    log.detail ? log.detail.replace(/^/gm, "    ") : null,
  ]
    .filter(Boolean)
    .join("\n");

const rigaAi = (call: FailedAiCall): string =>
  `${call.createdAt} ${call.capability} (${call.model})\n    ${call.error ?? "senza messaggio"}`;

/**
 * Il registro come testo, per mandarlo via.
 *
 * Un file di testo e non gli appunti: un guasto lungo - uno stack, il corpo di
 * una risposta - negli appunti si perde alla prima copia successiva, e da un
 * telefono il modo naturale di far arrivare qualcosa altrove e' il foglio di
 * condivisione del sistema, lo stesso che usa il backup.
 */
export async function buildLogReport(): Promise<string> {
  const [logs, aiCalls] = await Promise.all([
    recentLogs(),
    recentFailedAiCalls(),
  ]);

  return [
    `KalTrack - registro dei guasti`,
    `Esportato: ${new Date().toISOString()}`,
    "",
    `== Guasti (${logs.length}) ==`,
    logs.length ? logs.map(riga).join("\n") : "nessuno",
    "",
    `== Chiamate AI non riuscite (${aiCalls.length}) ==`,
    aiCalls.length ? aiCalls.map(rigaAi).join("\n") : "nessuna",
    "",
  ].join("\n");
}

/** Scrive il registro su file e apre il foglio di condivisione. */
export async function shareLogReport(): Promise<void> {
  const testo = await buildLogReport();
  const nome = `kaltrack-log-${new Date().toISOString().slice(0, 10)}.txt`;
  const path = `${FileSystem.documentDirectory}${nome}`;
  await FileSystem.writeAsStringAsync(path, testo);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "text/plain",
      dialogTitle: "KalTrack log",
    });
  }
}
