import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import React from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  type ViewStyle,
} from "react-native";

interface DfButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "filled" | "outlined" | "ghost";
  color?: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  labelStyle?: TextStyle;
  fullWidth?: boolean;
}

export const DfButton = ({
  label,
  onPress,
  variant = "filled",
  color = theme.colors.gray600,
  loading = false,
  disabled = false,
  icon,
  style,
  labelStyle,
  fullWidth = true,
}: DfButtonProps) => {
  const isFilled = variant === "filled";
  const isOutlined = variant === "outlined";

  const handlePress = () => {
    Keyboard.dismiss();
    onPress?.();
  };

  return (
    <Pressable onPress={handlePress} disabled={disabled || loading}>
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            fullWidth && styles.fullWidth,
            isFilled && {
              backgroundColor: disabled ? theme.colors.gray300 : color,
            },
            isOutlined && {
              borderWidth: 1.5,
              borderColor: disabled ? theme.colors.gray100 : color,
              borderRadius: theme.radius.xl,
            },
            pressed && { opacity: 0.75 },
            style,
          ]}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={isFilled ? theme.colors.white : color}
            />
          ) : (
            <>
              {icon}
              <Text
                style={[
                  styles.label,
                  isFilled && {
                    color: disabled ? theme.colors.gray400 : theme.colors.white,
                  },
                  isOutlined && {
                    color: disabled ? theme.colors.gray400 : color,
                  },
                  variant === "ghost" && {
                    color: disabled ? theme.colors.gray400 : color,
                  },
                  labelStyle,
                ]}
              >
                {label}
              </Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.xl,
    minHeight: 40,
  },
  fullWidth: {
    width: "100%",
  },
  label: {
    fontWeight: "500",
    fontSize: 14,
    lineHeight: 22,
  },
});
