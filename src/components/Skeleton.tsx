import { useAppTheme } from "@/src/components/ThemeContext";
import { useEffect } from "react";
import { type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

export const Skeleton = ({ style }: { style?: ViewStyle | ViewStyle[] }) => {
  const { colors } = useAppTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        { backgroundColor: colors.surfaceMuted },
        style,
        animatedStyle,
      ]}
    />
  );
};
