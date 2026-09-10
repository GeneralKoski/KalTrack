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
import { Dimensions, Keyboard, Pressable, StyleSheet, View } from "react-native";

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
  /**
   * Cosa fa il bottone di sinistra, quando non e' "annulla".
   *
   * Senza, l'unico modo di metterci un'azione era passarla come `onClose`, che
   * pero' e' anche la via d'uscita di chi tocca fuori: la finestra si sarebbe
   * chiusa facendo quell'azione. Qui il bottone e la chiusura restano due cose
   * distinte.
   */
  onCancel?: () => void;
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
  onCancel,
}: DfAlertProps) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();

  /**
   * `avoidKeyboard` sposta la finestra, non la rimpicciolisce: senza questo il
   * tetto resterebbe l'85% dello schermo INTERO, e una finestra alta - la
   * composizione, la stima da foto, che sono `size="lg"` - salendo si
   * infilerebbe sotto la status bar invece di stare nello spazio che resta.
   */
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  React.useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const resolvedConfirmColor =
    confirmColor === "danger" ? colors.error : confirmColor;

  const handleCancel = () => {
    if (loading) return;
    // `dismissable` parla di chi tocca fuori, non di un bottone che si e'
    // scelto di mettere: un'azione dichiarata con `onCancel` deve rispondere
    // anche in una finestra da cui non si esce toccando lo sfondo.
    if (onCancel) {
      onCancel();
      return;
    }
    if (!dismissable) return;
    onClose();
  };

  const handleDismiss = () => {
    if (loading || !dismissable) return;
    (onDismiss ?? onClose)();
  };

  const pair = (
    <>
      {!hideCancel && (
        <View style={styles.buttonWrapper}>
          <DfButton
            label={cancelLabel ?? t("cancel")}
            variant={cancelVariant ?? "outlined"}
            color={cancelColor}
            style={[styles.cancelButton, { borderColor: colors.border }]}
            onPress={handleCancel}
            disabled={loading}
          />
        </View>
      )}
      <View style={styles.buttonWrapper}>
        <DfButton
          label={confirmLabel ?? t("confirm")}
          style={styles.confirmButton}
          color={resolvedConfirmColor}
          loading={loading}
          icon={confirmIcon}
          onPress={onConfirm}
        />
      </View>
    </>
  );

  return (
    <AlertDialog
      isOpen={isOpen}
      onClose={handleDismiss}
      size={size}
      // La finestra e' centrata sullo schermo intero, e sotto edge-to-edge la
      // tastiera non restringe niente (vedi `FormScreen`): quella con dentro un
      // campo - i grammi, la voce libera, la composizione - si faceva tagliare
      // il fondo, cioe' proprio i bottoni Annulla/Conferma. `avoidKeyboard`
      // mette sotto al contenuto uno spazio alto quanto la tastiera: in un
      // contenitore centrato la finestra sale di meta', che e' esattamente il
      // ricentrare nello spazio che resta.
      avoidKeyboard
    >
      <AlertDialogBackdrop
        style={[
          styles.backdrop,
          {
            backgroundColor: isDark
              ? "rgba(10, 10, 12, 0.78)"
              : "rgba(0, 0, 0, 0.55)",
          },
        ]}
      />
      <AlertDialogContent
        style={{
          backgroundColor: colors.surface,
          borderColor: isDark ? "rgba(255, 255, 255, 0.18)" : colors.border,
          borderWidth: 1,
          borderRadius: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.7 : 0.25,
          shadowRadius: 20,
          elevation: 16,
          maxHeight:
            (Dimensions.get("window").height - keyboardHeight) * 0.85,
        }}
        className="p-0 overflow-hidden"
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
            // Con un `footerExtra` il piede diventa una colonna: l'extra e' una
            // via laterale e sta SOTTO i due bottoni, non accanto - in riga si
            // porterebbe via lo spazio di Annulla e Conferma.
            verticalFooter || footerExtra
              ? "px-5 pb-5 pt-5 gap-3 flex-col items-stretch"
              : "px-5 pb-5 pt-5 gap-3 justify-stretch"
          }
        >
          {verticalFooter ? (
            <>
              <DfButton
                label={confirmLabel ?? t("confirm")}
                style={styles.confirmButton}
                color={resolvedConfirmColor}
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
          ) : footerExtra ? (
            <View style={styles.pair}>{pair}</View>
          ) : (
            pair
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
  pair: {
    flexDirection: "row",
    gap: 12,
  },
  // Nessun padding orizzontale qui: questi stili finiscono sul TouchableOpacity
  // ESTERNO di DfButton, che ha gia' il suo padding sulla View interna. Sommati
  // facevano 40dp per lato e in un dialogo a due bottoni non restava spazio per
  // la parola: "Annulla" veniva troncato in "Annul...".
  cancelButton: {
    paddingVertical: 8,
    minHeight: 30,
  },
  confirmButton: {
    paddingVertical: 8,
    minHeight: 30,
  },
  backdrop: {
    backgroundColor: "rgba(0, 0, 0, 0.65)",
  },
});
