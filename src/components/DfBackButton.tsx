import { ChevronLeftIcon } from "@/src/components/icons/ChevronLeftIcon";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { useNavigation } from "@react-navigation/native";
import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";

interface DfBackButtonProps {
  label?: string;
  onPress?: () => void;
  color?: string;
  showLabel?: boolean;
  style?: ViewStyle;
}

export const DfBackButton = ({
  label,
  onPress,
  color,
  showLabel = true,
  style,
}: DfBackButtonProps) => {
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  if (!onPress && !navigation.canGoBack()) return null;

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      style={[styles.button, style]}
    >
      {({ pressed }) => (
        <View style={[styles.content, pressed && { opacity: 0.75 }]}>
          <ChevronLeftIcon color={color ?? colors.accent} />
          {showLabel && (
            <Text
              style={[styles.label, { color: colors.text }]}
              numberOfLines={1}
            >
              {label ?? t("back")}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignSelf: "flex-start",
    justifyContent: "center",
    marginLeft: -theme.spacing.sm,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: 16,
    fontWeight: "400",
    includeFontPadding: false,
  },
});
