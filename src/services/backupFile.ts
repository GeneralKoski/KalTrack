import { buildBackup, parseBackup, type BackupPayload } from "@/src/services/backup";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const fileName = (): string =>
  `kaltrack-backup-${new Date().toISOString().slice(0, 10)}.json`;

/** Scrive il backup su file e ne ritorna il percorso. */
export async function exportBackupToFile(): Promise<string> {
  const payload = await buildBackup();
  const path = `${FileSystem.documentDirectory}${fileName()}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
  return path;
}

/** Esporta e apre il foglio di condivisione del sistema. */
export async function shareBackup(): Promise<void> {
  const path = await exportBackupToFile();
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      dialogTitle: "KalTrack backup",
    });
  }
}

/** Legge e valida un file di backup scelto dall'utente. */
export async function readBackupFile(uri: string): Promise<BackupPayload> {
  const content = await FileSystem.readAsStringAsync(uri);
  return parseBackup(content);
}
