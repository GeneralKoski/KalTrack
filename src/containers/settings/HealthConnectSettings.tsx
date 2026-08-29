import { useAppTheme } from "@/src/components/ThemeContext";
import { MetalSurface } from "@/src/components/kal";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import {
  HealthPermissionError,
  HealthUnavailableError,
  type HealthStatus,
  type HealthUnavailableReason,
  getHealthProvider,
  getLastStepSync,
  importStepsFromHealth,
  isStepImportEnabled,
  setStepImportEnabled,
} from "@/src/services/healthConnect";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { ExternalLink, RefreshCw } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";

const UNAVAILABLE_KEY: Record<HealthUnavailableReason, string> = {
  platform: "health_connect.unavailable_platform",
  module_missing: "health_connect.unavailable_module",
  provider_missing: "health_connect.unavailable_provider_missing",
  provider_outdated: "health_connect.unavailable_provider_outdated",
};

/** Data e ora dell'ultima sincronizzazione, senza i secondi che non servono. */
const formatSync = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
};

export const HealthConnectSettings: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [nextStatus, nextEnabled, nextSync] = await Promise.all([
          getHealthProvider().status(),
          isStepImportEnabled(),
          getLastStepSync(),
        ]);
        if (!active) return;
        setStatus(nextStatus);
        setEnabled(nextEnabled);
        setLastSync(nextSync);
      } catch (error) {
        logger.error("[HealthConnectSettings] stato non leggibile", error);
        if (active) setStatus({ kind: "unavailable", reason: "module_missing" });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /**
   * Riporta sempre l'esito: un'importazione che non scrive nulla e una che
   * fallisce si somigliano troppo se l'unico segnale è che non cambia niente.
   */
  const runSync = useCallback(async (): Promise<void> => {
    try {
      const outcome = await importStepsFromHealth();
      setLastSync(await getLastStepSync());

      if (outcome.imported > 0) {
        showToast.success({
          message: t("health_connect.sync_imported", {
            count: outcome.imported,
          }),
        });
      } else if (outcome.keptManual > 0) {
        showToast.info({
          message: t("health_connect.sync_kept_manual", {
            count: outcome.keptManual,
          }),
        });
      } else {
        showToast.info({ message: t("health_connect.sync_nothing") });
      }
    } catch (error) {
      logger.error("[HealthConnectSettings] importazione fallita", error);
      if (error instanceof HealthUnavailableError) {
        setStatus({ kind: "unavailable", reason: error.reason });
        showToast.error({ message: t(UNAVAILABLE_KEY[error.reason]) });
      } else if (error instanceof HealthPermissionError) {
        setStatus({ kind: "available", permissionGranted: false });
        showToast.error({ message: t("health_connect.permission_needed") });
      } else {
        showToast.error({ message: t("health_connect.sync_failed") });
      }
    }
  }, [t]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      try {
        if (!next) {
          await setStepImportEnabled(false);
          setEnabled(false);
          return;
        }

        const provider = getHealthProvider();
        const granted =
          status?.kind === "available" && status.permissionGranted
            ? true
            : await provider.requestPermission();

        if (!granted) {
          setStatus(await provider.status());
          showToast.error({ message: t("health_connect.permission_denied") });
          return;
        }

        setStatus({ kind: "available", permissionGranted: true });
        await setStepImportEnabled(true);
        setEnabled(true);
        // Accendere l'interruttore senza portare subito i dati lascerebbe
        // l'utente davanti a un "Mai sincronizzato" senza capire perché.
        await runSync();
      } catch (error) {
        logger.error("[HealthConnectSettings] interruttore fallito", error);
        showToast.error({ message: t("health_connect.sync_failed") });
      } finally {
        setBusy(false);
      }
    },
    [busy, runSync, status, t],
  );

  const onSyncPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runSync();
    } finally {
      setBusy(false);
    }
  }, [busy, runSync]);

  const onGrantPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const provider = getHealthProvider();
      const granted = await provider.requestPermission();
      setStatus(await provider.status());
      if (!granted) {
        showToast.error({ message: t("health_connect.permission_denied") });
      }
    } catch (error) {
      logger.error("[HealthConnectSettings] permesso non richiedibile", error);
      showToast.error({ message: t("health_connect.sync_failed") });
    } finally {
      setBusy(false);
    }
  }, [busy, t]);

  const available = status?.kind === "available";
  const permissionGranted = status?.kind === "available" && status.permissionGranted;

  return (
    <View style={[styles.group, { backgroundColor: colors.surface }]}>
      <View style={styles.row}>
        <Text
          style={[styles.label, { color: available ? colors.text : colors.textMuted }]}
          numberOfLines={2}
        >
          {t("health_connect.import_steps")}
        </Text>
        {status === null ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Switch
            value={enabled && available}
            onValueChange={onToggle}
            disabled={!available || busy}
            thumbColor={theme.colors.white}
            trackColor={{ false: colors.border, true: colors.accent }}
          />
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.block}>
        {status?.kind === "unavailable" ? (
          <>
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t(UNAVAILABLE_KEY[status.reason])}
            </Text>
            {status.reason === "provider_missing" ||
            status.reason === "provider_outdated" ? (
              <TouchableOpacity
                onPress={() => getHealthProvider().openSettings()}
                activeOpacity={0.6}
                style={styles.linkRow}
                hitSlop={8}
              >
                <ExternalLink size={16} color={colors.accent} />
                <Text
                  style={[styles.link, { color: colors.accent }]}
                  numberOfLines={1}
                >
                  {t("health_connect.open_provider")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[styles.note, { color: colors.textMuted }]}>
              {t("health_connect.manual_wins")}
            </Text>

            {available && !permissionGranted ? (
              <>
                <Text style={[styles.note, { color: colors.textMuted }]}>
                  {t("health_connect.permission_needed")}
                </Text>
                <TouchableOpacity
                  onPress={onGrantPress}
                  activeOpacity={0.6}
                  disabled={busy}
                >
                  <MetalSurface radius={theme.radius.lg} style={styles.button}>
                    <Text
                      style={[styles.buttonLabel, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {t("health_connect.grant")}
                    </Text>
                  </MetalSurface>
                </TouchableOpacity>
              </>
            ) : null}

            {enabled && permissionGranted ? (
              <>
                <View style={styles.syncRow}>
                  <Text
                    style={[styles.note, { color: colors.textMuted }]}
                    numberOfLines={1}
                  >
                    {t("health_connect.last_sync")}
                  </Text>
                  <Text style={[styles.syncValue, { color: colors.textSecondary }]}>
                    {lastSync
                      ? formatSync(lastSync)
                      : t("health_connect.never_synced")}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={onSyncPress}
                  activeOpacity={0.6}
                  disabled={busy}
                >
                  <MetalSurface radius={theme.radius.lg} style={styles.button}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <>
                        <RefreshCw size={16} color={colors.text} />
                        <Text
                          style={[styles.buttonLabel, { color: colors.text }]}
                          numberOfLines={1}
                        >
                          {t("health_connect.sync_now")}
                        </Text>
                      </>
                    )}
                  </MetalSurface>
                </TouchableOpacity>
              </>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: { borderRadius: theme.radius.xl, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  divider: { height: StyleSheet.hairlineWidth },
  block: { padding: theme.spacing.md, gap: theme.spacing.sm },
  label: { flexShrink: 1, fontSize: 15, fontWeight: "500" },
  note: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  link: { flexShrink: 1, fontSize: 13, fontWeight: "600" },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  syncValue: { fontSize: 13, fontWeight: "600" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  buttonLabel: { flexShrink: 1, fontSize: 14, fontWeight: "600" },
});
