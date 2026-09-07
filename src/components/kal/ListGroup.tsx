import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { ChevronRight } from "lucide-react-native";
import React, { type ReactNode } from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

/**
 * Il secondo dei tre livelli di superficie: N righe dentro UNA superficie.
 *
 * Prima ogni voce di un elenco era una `Card` per conto suo, con bordo, ombra e
 * gap: cinque voci del profilo riempivano uno schermo, e una voce di menu
 * pesava quanto il riepilogo di una giornata. Un blocco e' un oggetto solo, e
 * le righe che contiene si distinguono con una linea invece che con un vuoto.
 *
 * La `Card` resta per quel che e' davvero una scheda a se' (il riquadro di una
 * metrica, una tessera di contenuto); non per fare da cornice a una riga.
 */

/** Altezza di una riga a una sola linea di testo. Sopra i 44 di area di tocco. */
export const ROW_HEIGHT = 48;

const ROW_PADDING = theme.spacing.md;
const ROW_GAP = theme.spacing.sm + 4;
const ICON_SIZE = 20;

/** Rientro del separatore: parte dove finisce l'icona, non dal bordo. */
const SEPARATOR_INDENT = ROW_PADDING + ICON_SIZE + ROW_GAP;

interface ListGroupProps {
  children: ReactNode;
  /**
   * Rientro del separatore. Da passare a 0 quando le righe non hanno icona,
   * altrimenti la linea comincia in mezzo al testo.
   */
  indent?: number;
  style?: StyleProp<ViewStyle>;
}

export const ListGroup: React.FC<ListGroupProps> = ({
  children,
  indent = SEPARATOR_INDENT,
  style,
}) => {
  const { colors, isDark } = useAppTheme();
  const rows = React.Children.toArray(children).filter(Boolean);

  return (
    <View
      style={[
        styles.group,
        {
          backgroundColor: colors.surface,
          // Come in `Card`: al buio l'ombra non si vede e senza bordo il blocco
          // sparirebbe nello sfondo.
          borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <View
              style={[
                styles.separator,
                { backgroundColor: colors.border, marginLeft: indent },
              ]}
            />
          ) : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
};

interface ListRowProps {
  label: string;
  /** Seconda riga sotto l'etichetta: la riga cresce da sola. */
  detail?: string;
  icon?: ReactNode;
  /** Sostituisce il chevron a destra (un valore, una spunta, un bottone). */
  right?: ReactNode;
  /** Colore dell'etichetta: per le righe che sono una scelta e sono attive. */
  labelColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Di serie il chevron c'e' se la riga si tocca e non ha un `right`. */
  chevron?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const ListRow: React.FC<ListRowProps> = ({
  label,
  detail,
  icon,
  right,
  labelColor,
  onPress,
  onLongPress,
  chevron,
  disabled = false,
  accessibilityLabel,
  style,
}) => {
  const { colors } = useAppTheme();
  const showChevron = chevron ?? (Boolean(onPress) && right === undefined);

  const content = (
    <>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.texts}>
        <Text
          style={[
            styles.label,
            { color: disabled ? colors.textFaint : (labelColor ?? colors.text) },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            style={[styles.detail, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
      {showChevron ? (
        <ChevronRight size={18} color={colors.textFaint} />
      ) : null}
    </>
  );

  if (!onPress && !onLongPress) {
    return <View style={[styles.row, style]}>{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.6}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.row, style]}
    >
      {content}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  group: {
    borderRadius: theme.radius.xl,
    // Le righe arrivano al bordo: senza questo gli angoli del primo e
    // dell'ultimo tocco sborderebbero dal raggio del blocco.
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_GAP,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: theme.spacing.sm,
  },
  icon: {
    width: ICON_SIZE,
    alignItems: "center",
  },
  texts: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
  },
  detail: {
    fontSize: 12,
  },
});
