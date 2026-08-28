import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, View } from "react-native";

interface AvatarProps {
  // data URI o URL della foto (vuoto = iniziali).
  photoUri?: string;
  // data URI della bandiera nazionalità (badge in basso a destra).
  flagUri?: string;
  name?: string;
  size?: number;
  // Colore del pallino di stato (semaforo documenti) sovrapposto in alto a
  // destra sull'avatar. Assente = nessun pallino.
  statusColor?: string;
}

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "?";
}

// Avatar circolare con foto (o iniziali) e badge bandiera opzionale.
export const Avatar: React.FC<AvatarProps> = ({
  photoUri,
  flagUri,
  name,
  size = 52,
  statusColor,
}) => {
  const { colors } = useAppTheme();
  const flagSize = Math.round(size * 0.42);
  const statusSize = Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size }}>
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceMuted,
          }}
          contentFit="cover"
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.34 }]}>
            {initials(name)}
          </Text>
        </View>
      )}
      {flagUri ? (
        <Image
          source={{ uri: flagUri }}
          style={[
            styles.flag,
            {
              width: flagSize,
              height: flagSize,
              borderRadius: flagSize / 2,
              borderColor: colors.surface,
            },
          ]}
          contentFit="cover"
        />
      ) : null}
      {statusColor ? (
        <View
          style={[
            styles.status,
            {
              width: statusSize,
              height: statusSize,
              borderRadius: statusSize / 2,
              backgroundColor: statusColor,
              borderColor: colors.surface,
            },
          ]}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: theme.colors.brand100,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontWeight: "700", color: theme.colors.brand700 },
  flag: {
    position: "absolute",
    bottom: -2,
    right: -2,
    borderWidth: 2,
  },
  status: {
    position: "absolute",
    top: -1,
    right: -1,
    borderWidth: 2,
  },
});
