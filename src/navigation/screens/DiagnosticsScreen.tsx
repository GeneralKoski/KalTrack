import { MissingApiKeyError } from "@/src/ai/errors";
import { checkModels, type ModelCheck } from "@/src/ai/health";
import { DfButton } from "@/src/components/form/DfButton";
import { Card, EmptyState, ScreenBackground, SectionLabel } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  aiUsage,
  clearLogs,
  recentFailedAiCalls,
  recentLogs,
  type AiUsage,
  type AppLog,
  type FailedAiCall,
} from "@/src/db/queries/logs";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { shareLogReport } from "@/src/services/logExport";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Check, ChevronLeft, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/** Data e ora leggibili, senza secondi: la precisione al secondo qui non serve. */
const quando = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

/**
 * La quota di token in entrata servita dalla cache.
 *
 * Si divide per i token delle sole chiamate che hanno dichiarato il dato, non
 * per il totale: la trascrizione passa dall'endpoint nativo e non riporta i
 * token affatto, e metterla al denominatore diluirebbe la percentuale con
 * chiamate su cui la domanda non e' mai stata posta.
 */
const percentuale = (usage: AiUsage): number =>
  usage.tokensIn > 0
    ? Math.round((usage.cachedTokens / usage.tokensIn) * 100)
    : 0;

/**
 * Una riga che si apre.
 *
 * Il dettaglio - uno stack, il corpo di una risposta - e' lungo e quasi sempre
 * non serve: chiuso di serie, l'elenco resta scorribile, e chi cerca una cosa
 * precisa apre solo quella.
 */
const RigaApribile: React.FC<{
  titolo: string;
  sottotitolo: string;
  dettaglio: string | null;
  colore: string;
}> = ({ titolo, sottotitolo, dettaglio, colore }) => {
  const { colors } = useAppTheme();
  const [aperta, setAperta] = useState(false);

  return (
    <Card
      style={styles.riga}
      onPress={dettaglio ? () => setAperta((v) => !v) : undefined}
    >
      <View style={styles.rigaTesta}>
        <View style={[styles.pallino, { backgroundColor: colore }]} />
        <Text style={[styles.titolo, { color: colors.text }]} numberOfLines={2}>
          {titolo}
        </Text>
      </View>
      <Text style={[styles.sottotitolo, { color: colors.textFaint }]}>
        {sottotitolo}
      </Text>
      {aperta && dettaglio ? (
        <Text style={[styles.dettaglio, { color: colors.textSecondary }]}>
          {dettaglio}
        </Text>
      ) : null}
    </Card>
  );
};

export function DiagnosticsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { goBack } = useAppNav();

  const [logs, setLogs] = useState<AppLog[]>([]);
  const [aiCalls, setAiCalls] = useState<FailedAiCall[]>([]);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [busy, setBusy] = useState<"share" | "clear" | "models" | null>(null);
  const [checks, setChecks] = useState<ModelCheck[] | null>(null);

  const ricarica = useCallback(async () => {
    const [righe, chiamate, consumo] = await Promise.all([
      recentLogs(),
      recentFailedAiCalls(),
      aiUsage(),
    ]);
    setLogs(righe);
    setAiCalls(chiamate);
    setUsage(consumo);
  }, []);

  useEffect(() => {
    ricarica().catch((error) => {
      logger.error("[diagnostica] lettura del registro fallita", error);
    });
  }, [ricarica]);

  const onShare = async () => {
    setBusy("share");
    try {
      await shareLogReport();
    } catch (error) {
      logger.error("[diagnostica] condivisione fallita", error);
      showToast.error({ title: t("diagnostics.share_failed") });
    } finally {
      setBusy(null);
    }
  };

  /**
   * La prova esiste perche' un modello ritirato non da' segno di se': la
   * capability muore e l'app non ha modo di sapere perche'. Qui si chiede a
   * Gemini l'elenco di quel che serve a questa chiave e si confronta.
   */
  const onCheckModels = async () => {
    setBusy("models");
    try {
      setChecks(await checkModels());
    } catch (error) {
      setChecks(null);
      if (error instanceof MissingApiKeyError) {
        showToast.error({ title: t("diagnostics.models_no_key") });
      } else {
        logger.error("[diagnostica] prova dei modelli fallita", error);
        showToast.error({ title: t("diagnostics.models_failed") });
      }
      await ricarica();
    } finally {
      setBusy(null);
    }
  };

  const onClear = async () => {
    setBusy("clear");
    try {
      await clearLogs();
      await ricarica();
    } catch (error) {
      logger.error("[diagnostica] svuotamento fallito", error);
    } finally {
      setBusy(null);
    }
  };

  const vuoto = logs.length === 0 && aiCalls.length === 0;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {t("diagnostics.title")}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.lg },
          ]}
        >
          <Text style={[styles.explain, { color: colors.textSecondary }]}>
            {t("diagnostics.explain")}
          </Text>

          {/*
            Le tre azioni stanno in cima e non in fondo: sono il motivo per cui
            si apre questa schermata, e in fondo a trecento righe di registro
            si raggiungevano solo scorrendo.
          */}
          <View style={styles.azioni}>
            <DfButton
              label={t("diagnostics.models_check")}
              variant="outlined"
              compact
              fullWidth={false}
              onPress={onCheckModels}
              loading={busy === "models"}
              disabled={busy !== null}
              style={styles.azione}
            />
            <DfButton
              label={t("diagnostics.share")}
              variant="outlined"
              compact
              fullWidth={false}
              onPress={onShare}
              loading={busy === "share"}
              disabled={vuoto || busy !== null}
              style={styles.azione}
            />
            <DfButton
              label={t("diagnostics.clear")}
              variant="outlined"
              color={theme.colors.error}
              compact
              fullWidth={false}
              onPress={onClear}
              loading={busy === "clear"}
              disabled={vuoto || busy !== null}
              style={styles.azione}
            />
          </View>

          {/*
            L'esito della prova compare solo dopo averla chiesta: prima non
            c'e' niente da dire, e una card vuota sembrerebbe un guasto.
          */}
          {checks ? (
            <Card style={styles.modelli}>
              {checks.map((check) => (
                <View key={check.capability} style={styles.modelloRiga}>
                  {check.served ? (
                    <Check size={16} color={theme.colors.success} />
                  ) : (
                    <X size={16} color={theme.colors.error} />
                  )}
                  <Text
                    style={[styles.modelloNome, { color: colors.text }]}
                    numberOfLines={1}
                  >
                    {t(`diagnostics.capability.${check.capability}`)}
                  </Text>
                  <Text
                    style={[styles.modelloId, { color: colors.textFaint }]}
                    numberOfLines={1}
                  >
                    {check.model}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          <SectionLabel>{t("diagnostics.usage_section")}</SectionLabel>
          <Card style={styles.modelli}>
            {usage && usage.calls > 0 ? (
              <>
                <Text style={[styles.modelliHint, { color: colors.textFaint }]}>
                  {t("diagnostics.usage_hint", {
                    days: usage.days,
                    calls: usage.calls,
                  })}
                </Text>
                <Text style={[styles.consumo, { color: colors.text }]}>
                  {t("diagnostics.usage_tokens", {
                    tokensIn: usage.tokensIn.toLocaleString("it-IT"),
                    tokensOut: usage.tokensOut.toLocaleString("it-IT"),
                  })}
                </Text>
                <Text
                  style={[
                    styles.consumo,
                    {
                      color:
                        usage.measured === 0
                          ? colors.textFaint
                          : theme.colors.success,
                    },
                  ]}
                >
                  {usage.measured === 0
                    ? t("diagnostics.usage_unmeasured")
                    : t("diagnostics.usage_cached", {
                        percent: percentuale(usage),
                      })}
                </Text>
              </>
            ) : (
              <Text style={[styles.modelliHint, { color: colors.textFaint }]}>
                {t("diagnostics.usage_none")}
              </Text>
            )}
          </Card>

          {vuoto ? (
            <EmptyState message={t("diagnostics.empty")} />
          ) : (
            <>
              {aiCalls.length > 0 ? (
                <>
                  <SectionLabel>{t("diagnostics.ai_section")}</SectionLabel>
                  {aiCalls.map((call) => (
                    <RigaApribile
                      key={call.id}
                      titolo={call.error ?? t("diagnostics.no_message")}
                      sottotitolo={`${quando(call.createdAt)} · ${call.capability} · ${call.model}`}
                      dettaglio={null}
                      colore={theme.colors.error}
                    />
                  ))}
                </>
              ) : null}

              {logs.length > 0 ? (
                <>
                  <SectionLabel style={styles.section}>
                    {t("diagnostics.log_section")}
                  </SectionLabel>
                  {logs.map((log) => (
                    <RigaApribile
                      key={log.id}
                      titolo={log.message}
                      sottotitolo={`${quando(log.createdAt)}${log.scope ? ` · ${log.scope}` : ""}`}
                      dettaglio={log.detail}
                      colore={log.level === "error" ? theme.colors.error : theme.colors.warning}
                    />
                  ))}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
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
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  content: { padding: theme.spacing.md, gap: theme.spacing.sm },
  explain: { fontSize: 13, lineHeight: 19 },
  section: { marginTop: theme.spacing.md },
  riga: { padding: theme.spacing.sm, gap: 4 },
  rigaTesta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  pallino: { width: 8, height: 8, borderRadius: 4 },
  titolo: { flex: 1, fontSize: 14, fontWeight: "600" },
  sottotitolo: { fontSize: 12 },
  dettaglio: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  azioni: { flexDirection: "row", gap: theme.spacing.sm },
  // Tre larghezze uguali: con la larghezza dettata dal testo "Svuota" restava
  // un francobollo accanto agli altri due.
  azione: { flex: 1 },
  modelli: { padding: theme.spacing.md, gap: theme.spacing.sm },
  modelliHint: { fontSize: 12, lineHeight: 17 },
  consumo: { fontSize: 13, lineHeight: 19 },
  modelloRiga: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  modelloNome: { fontSize: 13, fontWeight: "600" },
  modelloId: { flex: 1, fontSize: 11, textAlign: "right" },
});
