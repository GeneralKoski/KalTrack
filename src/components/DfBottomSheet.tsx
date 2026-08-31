import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { MAX_WEB_WIDTH, theme } from "@/src/styles";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { X } from "lucide-react-native";
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import {
  BackHandler,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface DfBottomSheetProps {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
  /**
   * Il back di Android da dentro il foglio: `true` = gestito qui dentro (una
   * sotto-vista è tornata indietro e il foglio resta aperto), `false` = chiudi
   * il foglio.
   */
  onAndroidBack?: () => boolean;
}

export const DfBottomSheet = forwardRef<BottomSheetModal, DfBottomSheetProps>(
  ({ title, children, style, onDismiss, onAndroidBack }, ref) => {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [isOpen, setIsOpen] = useState(false);

    const dismiss = useCallback(() => {
      if (typeof ref === "object" && ref?.current) ref.current.dismiss();
    }, [ref]);

    /**
     * Il foglio vive FUORI dallo stack di navigazione, quindi il back di
     * Android gli passa attraverso: arrivava a react-navigation, che faceva il
     * pop della schermata dietro. Da qui lo sfondo che si muoveva invece del
     * foglio che si chiudeva.
     *
     * Il listener sta su solo da aperto e consuma sempre l'evento.
     */
    useEffect(() => {
      if (!isOpen) return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (onAndroidBack?.()) return true;
        dismiss();
        return true;
      });
      return () => sub.remove();
    }, [isOpen, onAndroidBack, dismiss]);

    useEffect(() => {
      if (Platform.OS === "web") return;

      const showSub = Keyboard.addListener("keyboardDidShow", () =>
        setIsKeyboardOpen(true),
      );
      const hideSub = Keyboard.addListener("keyboardDidHide", () =>
        setIsKeyboardOpen(false),
      );

      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }, []);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      ),
      [],
    );

    const safeBottomInset = insets.bottom + 16;

    const header = (
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        {/* Solo la X: accanto a un'icona già inequivocabile la parola
            "Chiudi" era rumore, e rubava larghezza al titolo. */}
        <Pressable onPress={dismiss} hitSlop={12} accessibilityLabel={t("close")}>
          {({ pressed }) => (
            <View
              style={[
                styles.closeButton,
                { backgroundColor: colors.surfaceMuted },
                pressed && { opacity: 0.75 },
              ]}
            >
              <X size={18} color={colors.text} />
            </View>
          )}
        </Pressable>
      </View>
    );

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing={!isKeyboardOpen}
        maxDynamicContentSize={MAX_SHEET_HEIGHT}
        snapPoints={isKeyboardOpen ? ["88%"] : undefined}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onChange={(index) => setIsOpen(index >= 0)}
        onDismiss={() => {
          Keyboard.dismiss();
          onDismiss?.();
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        {...(Platform.OS === "web" && {
          containerStyle: {
            maxWidth: MAX_WEB_WIDTH,
            marginHorizontal: "auto",
          },
        })}
      >
        <BottomSheetScrollView
          style={[styles.content, style]}
          keyboardShouldPersistTaps="handled"
        >
          {title && header}
          {children}
          {!isKeyboardOpen && <View style={{ height: safeBottomInset }} />}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

DfBottomSheet.displayName = "DfBottomSheet";

const MAX_SHEET_HEIGHT = Dimensions.get("window").height * 0.85;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
