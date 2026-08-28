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
}

export const DfBottomSheet = forwardRef<BottomSheetModal, DfBottomSheetProps>(
  ({ title, children, style, onDismiss }, ref) => {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

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
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Pressable
          onPress={() => {
            if (typeof ref === "object" && ref?.current) {
              ref.current.dismiss();
            }
          }}
        >
          {({ pressed }) => (
            <View style={[styles.closeButton, pressed && { opacity: 0.75 }]}>
              <X size={16} color={colors.text} />
              <Text style={[styles.closeLabel, { color: colors.text }]}>
                {t("close")}
              </Text>
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
        onDismiss={() => {
          Keyboard.dismiss();
          onDismiss?.();
        }}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: theme.colors.white }}
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
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeLabel: {
    fontSize: 14,
    fontWeight: "500",
    includeFontPadding: false,
  },
});
