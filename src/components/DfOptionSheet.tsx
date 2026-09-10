import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from "@/components/ui/select/select-actionsheet";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { theme } from "@/src/styles";
import { Check } from "lucide-react-native";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface SheetOption<T extends string> {
  value: T;
  label: string;
  /** Una riga sotto l'etichetta: quel che il nome da solo non dice. */
  detail?: string;
}

interface DfOptionSheetProps<T extends string> {
  isOpen: boolean;
  title: string;
  options: SheetOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}

/**
 * Un elenco di opzioni che sale dal fondo, per i campi con troppe voci per un
 * `Segmented`.
 *
 * **Non e' un `DfBottomSheet`, e non e' una svista.** I fogli di gorhom vivono
 * dentro `BottomSheetModalProvider`, che in `App.tsx` sta SOTTO
 * `GluestackUIProvider`; e il portale di gluestack disegna le sue modali dopo
 * i figli del provider, cioe' sopra tutto quel che ci sta dentro. Un foglio
 * gorhom aperto da dentro un `DfAlert` finisce quindi DIETRO al dialogo, senza
 * un errore e senza niente a schermo. Queste sono le stesse primitive su cui
 * e' costruito `DfSelect`: stesso strato del dialogo, quindi l'ultima cosa
 * aperta e' l'ultima disegnata.
 *
 * Fuori da un dialogo resta valida la regola di sempre: si usa `DfBottomSheet`.
 */
export function DfOptionSheet<T extends string>({
  isOpen,
  title,
  options,
  value,
  onSelect,
  onClose,
}: DfOptionSheetProps<T>) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Actionsheet isOpen={isOpen} onClose={onClose}>
      <ActionsheetBackdrop />
      <ActionsheetContent
        style={{ backgroundColor: colors.surface }}
        className="px-0 pt-2 pb-0"
      >
        <ActionsheetDragIndicatorWrapper>
          <ActionsheetDragIndicator />
        </ActionsheetDragIndicatorWrapper>

        <View style={[styles.body, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>

          {options.map((option, index) => {
            const active = option.value === value;
            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelect(option.value)}
                style={[
                  styles.row,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.border,
                  },
                ]}
              >
                <View style={styles.texts}>
                  <Text
                    style={[
                      styles.label,
                      { color: active ? colors.accent : colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.detail ? (
                    <Text style={[styles.detail, { color: colors.textMuted }]}>
                      {option.detail}
                    </Text>
                  ) : null}
                </View>
                {active ? <Check size={18} color={colors.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </ActionsheetContent>
    </Actionsheet>
  );
}

const styles = StyleSheet.create({
  // `ActionsheetContent` centra i figli: senza la larghezza piena le righe si
  // stringerebbero sul proprio testo.
  body: {
    width: "100%",
    paddingHorizontal: theme.spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    paddingBottom: theme.spacing.sm,
  },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
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
