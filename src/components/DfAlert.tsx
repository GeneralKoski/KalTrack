import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { DfButton } from "@/src/components/form/DfButton";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { X } from "lucide-react-native";
import React from "react";
import { Dimensions, Pressable, StyleSheet, View } from "react-native";

interface DfAlertProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  children?: React.ReactNode;
  headerIcon?: React.ReactNode;
  showCloseButton?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmIcon?: React.ReactNode;
  confirmColor?: string;
  cancelVariant?: "filled" | "outlined" | "ghost";
  cancelColor?: string;
  loading?: boolean;
  dismissable?: boolean;
  hideCancel?: boolean;
  verticalFooter?: boolean;
  footerExtra?: React.ReactNode;
  size?: "xs" | "sm" | "md" | "lg" | "full";
  onConfirm: () => void;
  onClose: () => void;
  onDismiss?: () => void;
}

export function DfAlert({
  isOpen,
  title,
  message,
  children,
  headerIcon,
  showCloseButton = false,
  confirmLabel,
  cancelLabel,
  confirmIcon,
  confirmColor,
  cancelVariant,
  cancelColor,
  loading = false,
  dismissable = true,
  hideCancel = false,
  verticalFooter = false,
  footerExtra,
  size = "md",
  onConfirm,
  onClose,
  onDismiss,
}: DfAlertProps) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const handleCancel = () => {
    if (loading || !dismissable) return;
    onClose();
  };

  const handleDismiss = () => {
    if (loading || !dismissable) return;
    (onDismiss ?? onClose)();
  };

  return (
    <AlertDialog isOpen={isOpen} onClose={handleDismiss} size={size}>
      <AlertDialogBackdrop />
      <AlertDialogContent
        style={{
          backgroundColor: colors.surface,
          maxHeight: Dimensions.get("window").height * 0.85,
        }}
        className="border-0 p-0"
      >
        {(title || headerIcon || showCloseButton) && (
          <AlertDialogHeader
            className={headerIcon ? "px-5 pt-3 pb-1" : "px-5 pt-5 pb-2"}
          >
            <View style={styles.headerInner}>
              {headerIcon ? (
                <View style={styles.headerIconWrapper}>{headerIcon}</View>
              ) : title ? (
                <Text
                  style={[styles.title, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {title}
                </Text>
              ) : null}
              {showCloseButton && (
                <Pressable
                  onPress={handleDismiss}
                  hitSlop={10}
                  style={styles.closeButton}
                  disabled={loading}
                >
                  <X size={22} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          </AlertDialogHeader>
        )}

        {children ? (
          <AlertDialogBody className="px-5 pb-4">{children}</AlertDialogBody>
        ) : message ? (
          <AlertDialogBody className="px-5 pb-4">
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {message}
            </Text>
          </AlertDialogBody>
        ) : null}

        <AlertDialogFooter
          className={
            verticalFooter
              ? "px-5 pb-5 pt-5 gap-3 flex-col items-stretch"
              : "px-5 pb-5 pt-5 gap-3 justify-stretch"
          }
        >
          {verticalFooter ? (
            <>
              <DfButton
                label={confirmLabel ?? t("confirm")}
                style={styles.confirmButton}
                color={confirmColor}
                loading={loading}
                icon={confirmIcon}
                onPress={onConfirm}
              />
              {!hideCancel && (
                <DfButton
                  label={cancelLabel ?? t("cancel")}
                  variant={cancelVariant ?? "ghost"}
                  color={cancelColor ?? colors.textMuted}
                  style={styles.confirmButton}
                  onPress={handleCancel}
                  disabled={loading}
                />
              )}
            </>
          ) : (
            <>
              {!hideCancel && (
                <View style={styles.buttonWrapper}>
                  <DfButton
                    label={cancelLabel ?? t("cancel")}
                    variant={cancelVariant ?? "outlined"}
                    color={cancelColor}
                    style={[
                      styles.cancelButton,
                      { borderColor: colors.border },
                    ]}
                    onPress={handleCancel}
                    disabled={loading}
                  />
                </View>
              )}
              <View style={styles.buttonWrapper}>
                <DfButton
                  label={confirmLabel ?? t("confirm")}
                  style={styles.confirmButton}
                  color={confirmColor}
                  loading={loading}
                  icon={confirmIcon}
                  onPress={onConfirm}
                />
              </View>
            </>
          )}
          {footerExtra}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const styles = StyleSheet.create({
  headerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
  },
  headerIconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  closeButton: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 4,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonWrapper: {
    flex: 1,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 30,
  },
  confirmButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 30,
  },
});
