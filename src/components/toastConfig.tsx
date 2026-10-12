import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { i18n } from "@/src/i18n";
import {
  CheckCircle2,
  Info,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import Toast, {
  type ToastConfig,
  type ToastConfigParams,
} from "react-native-toast-message";

type Variant = "success" | "error" | "info" | "undo";

const VARIANTS: Record<Variant, { color: string; Icon: LucideIcon }> = {
  success: { color: theme.colors.success, Icon: CheckCircle2 },
  error: { color: theme.colors.error, Icon: XCircle },
  info: { color: theme.colors.info, Icon: Info },
  undo: { color: theme.colors.info, Icon: Trash2 },
};

/*
 * Il fondo dell'icona è il colore della variante al 15%, non un pastello
 * fisso: i pastelli erano tarati sul tema chiaro, e in quello scuro
 * diventavano quadrati luminosi sopra una superficie quasi nera.
 */
const TINT_ALPHA = "26";

function ToastCard({
  variant,
  text1,
  text2,
  onUndo,
}: {
  variant: Variant;
  text1?: string;
  text2?: string;
  onUndo?: () => void;
}) {
  const { colors } = useAppTheme();
  const { color, Icon } = VARIANTS[variant];
  const bg = `${color}${TINT_ALPHA}`;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={[styles.iconTile, { backgroundColor: bg }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={styles.body}>
        {text1 ? (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text
            style={[styles.message, { color: colors.textMuted }]}
            numberOfLines={5}
          >
            {text2}
          </Text>
        ) : null}
      </View>
      {onUndo ? (
        <TouchableOpacity
          onPress={() => {
            Toast.hide();
            onUndo();
          }}
          activeOpacity={0.6}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[styles.action, { color: colors.accent }]}>
            {i18n.t("diary.entry_restore")}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SuccessToast(p: ToastConfigParams<unknown>) {
  return <ToastCard variant="success" text1={p.text1} text2={p.text2} />;
}

function ErrorToast(p: ToastConfigParams<unknown>) {
  return <ToastCard variant="error" text1={p.text1} text2={p.text2} />;
}

function InfoToast(p: ToastConfigParams<unknown>) {
  return <ToastCard variant="info" text1={p.text1} text2={p.text2} />;
}

function UndoToast(p: ToastConfigParams<{ onUndo?: () => void }>) {
  return (
    <ToastCard variant="undo" text1={p.text1} onUndo={p.props.onUndo} />
  );
}

export const toastConfig: ToastConfig = {
  success: SuccessToast,
  error: ErrorToast,
  info: InfoToast,
  undo: UndoToast,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    width: "92%",
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    overflow: "hidden",
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  message: { fontSize: 13, lineHeight: 18 },
  action: { fontSize: 15, fontWeight: "700" },
});
