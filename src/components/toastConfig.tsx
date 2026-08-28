import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import {
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import React from "react";
import { StyleSheet, View } from "react-native";
import type { ToastConfig, ToastConfigParams } from "react-native-toast-message";

type Variant = "success" | "error" | "info";

const VARIANTS: Record<
  Variant,
  { color: string; bg: string; Icon: LucideIcon }
> = {
  success: { color: theme.colors.success, bg: "#ecfdf5", Icon: CheckCircle2 },
  error: { color: theme.colors.error, bg: "#fef2f2", Icon: XCircle },
  info: { color: theme.colors.info, bg: "#eff6ff", Icon: Info },
};

function ToastCard({
  variant,
  text1,
  text2,
}: {
  variant: Variant;
  text1?: string;
  text2?: string;
}) {
  const { color, bg, Icon } = VARIANTS[variant];
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={[styles.iconTile, { backgroundColor: bg }]}>
        <Icon size={20} color={color} />
      </View>
      <View style={styles.body}>
        {text1 ? (
          <Text style={styles.title} numberOfLines={2}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text style={styles.message} numberOfLines={5}>
            {text2}
          </Text>
        ) : null}
      </View>
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

export const toastConfig: ToastConfig = {
  success: SuccessToast,
  error: ErrorToast,
  info: InfoToast,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    width: "92%",
    backgroundColor: theme.colors.white,
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
  title: { fontSize: 15, fontWeight: "700", color: theme.colors.gray900 },
  message: { fontSize: 13, color: theme.colors.gray500, lineHeight: 18 },
});
