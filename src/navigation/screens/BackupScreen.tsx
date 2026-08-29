import { DfAlert } from "@/src/components/DfAlert";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { getSetting, setSetting } from "@/src/db/queries/settings";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import {
  backupSummary,
  restoreBackup,
  type BackupPayload,
} from "@/src/services/backup";
import { readBackupFile, shareBackup } from "@/src/services/backupFile";
import { CSV_DATASETS, shareCsv, type CsvDataset } from "@/src/services/csvExport";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import * as DocumentPicker from "expo-document-picker";
import { ChevronLeft, Download, Upload } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const LAST_EXPORT_KEY = "last_backup_export";

export function BackupScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();

  const [lastExport, setLastExport] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getSetting(LAST_EXPORT_KEY).then((value) => {
      if (active) setLastExport(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const onExport = async () => {
    setBusy(true);
    try {
      await shareBackup();
      const now = new Date().toISOString();
      await setSetting(LAST_EXPORT_KEY, now);
      setLastExport(now);
    } catch (error) {
      logger.error("[backup] export fallito", error);
      showToast.error({ title: t("backup.export_failed") });
    } finally {
      setBusy(false);
    }
  };

  const onExportCsv = async (dataset: CsvDataset) => {
    setBusy(true);
    try {
      await shareCsv(dataset);
    } catch (error) {
      logger.error("[backup] export CSV fallito", error);
      showToast.error({ title: t("backup.csv_failed") });
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/json",
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;

    try {
      setPending(await readBackupFile(result.assets[0].uri));
    } catch (error) {
      logger.error("[backup] file non valido", error);
      showToast.error({ title: t("backup.invalid_file") });
    }
  };

  const onConfirmRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setPending(null);
      showToast.success({ title: t("backup.restored") });
      goBack();
    } catch (error) {
      logger.error("[backup] ripristino fallito", error);
      showToast.error({ title: t("backup.restore_failed") });
    } finally {
      setBusy(false);
    }
  };

  const summary = pending ? backupSummary(pending) : [];

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {t("backup.title")}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <Text style={[styles.explain, { color: colors.textSecondary }]}>
              {t("backup.explain")}
            </Text>
            {lastExport ? (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t("backup.last_export", {
                  date: new Date(lastExport).toLocaleString("it-IT"),
                })}
              </Text>
            ) : (
              <Text style={[styles.meta, { color: colors.textMuted }]}>
                {t("backup.never_exported")}
              </Text>
            )}
          </Card>

          <DfButton
            label={t("backup.export")}
            icon={<Download size={18} color={colors.text} />}
            loading={busy}
            onPress={onExport}
          />

          {/*
            Il CSV è una cosa diversa dal backup: quello serve a ripristinare,
            questo ad aprire i propri dati in un foglio di calcolo. Tenerli
            separati evita che si scambi l'uno per l'altro.
          */}
          <SectionLabel style={styles.section}>
            {t("backup.csv_section")}
          </SectionLabel>
          <Text style={[styles.explain, { color: colors.textMuted }]}>
            {t("backup.csv_explain")}
          </Text>
          <View style={styles.csvRow}>
            {CSV_DATASETS.map((dataset: CsvDataset) => (
              <DfButton
                key={dataset}
                label={t(`backup.csv_${dataset}`)}
                variant="outlined"
                fullWidth={false}
                loading={busy}
                onPress={() => onExportCsv(dataset)}
                style={styles.csvButton}
              />
            ))}
          </View>

          <SectionLabel style={styles.section}>
            {t("backup.restore_section")}
          </SectionLabel>

          <DfButton
            label={t("backup.import")}
            variant="outlined"
            icon={<Upload size={18} color={colors.accent} />}
            onPress={onPickFile}
          />
        </ScrollView>
      </SafeAreaView>

      <DfAlert
        isOpen={pending !== null}
        title={t("backup.confirm_title")}
        confirmLabel={t("backup.confirm_restore")}
        confirmColor={theme.colors.error}
        loading={busy}
        onConfirm={onConfirmRestore}
        onClose={() => setPending(null)}
      >
        <View style={styles.summary}>
          <Text style={[styles.warning, { color: colors.text }]}>
            {t("backup.confirm_warning")}
          </Text>
          {pending?.exportedAt ? (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {t("backup.file_date", {
                date: new Date(pending.exportedAt).toLocaleString("it-IT"),
              })}
            </Text>
          ) : null}
          {summary.map((entry) => (
            <View key={entry.table} style={styles.summaryRow}>
              <Text
                style={[styles.summaryLabel, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {entry.table}
              </Text>
              <Text style={[styles.summaryValue, { color: colors.text }]}>
                {entry.rows}
              </Text>
            </View>
          ))}
        </View>
      </DfAlert>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700" },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  card: { gap: theme.spacing.xs },
  explain: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12 },
  section: { marginTop: theme.spacing.md },
  csvRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  csvButton: { flexGrow: 1 },
  summary: { gap: 4 },
  warning: { fontSize: 14, fontWeight: "600", marginBottom: theme.spacing.xs },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { flexShrink: 1, fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
});
