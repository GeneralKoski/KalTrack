import { Chip } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  listEquipmentAvailability,
  setEquipmentAvailability,
} from "@/src/db/queries/exercises";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { EQUIPMENT, type Equipment } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

/**
 * Dove si dichiara cosa NON si ha a disposizione.
 *
 * E' per eccezione e non per dichiarazione: ogni attrezzo parte spuntato, cioe'
 * "disponibile", e si tocca solo quello che manca davvero. Partire da zero
 * chiedeva di spuntare uno per uno tutto quel che si ha, e con nessun chip mai
 * attivo sembrava che il tocco non facesse niente.
 *
 * Il corpo libero non compare fra i chip: c'e' sempre, e chiedere di
 * deselezionarlo non avrebbe senso.
 */
export const EquipmentPicker: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    listEquipmentAvailability()
      .then((value) => {
        if (active) setState(value);
      })
      .catch((error) => {
        logger.error("[palestra] lettura attrezzatura fallita", error);
      });
    return () => {
      active = false;
    };
  }, []);

  const toggle = async (item: Equipment) => {
    // Lo stato visivo di partenza non e' `state[item]` ma "!== false": il
    // toggle deve invertire quello, non il valore grezzo (sempre `undefined`
    // finche' non lo si tocca).
    const next = state[item] === false;
    // Ottimistico: il tocco deve rispondere subito, e la scrittura e' locale.
    setState((current) => ({ ...current, [item]: next }));
    try {
      await setEquipmentAvailability(item, next);
    } catch (error) {
      logger.error("[palestra] salvataggio attrezzatura fallito", error);
      setState((current) => ({ ...current, [item]: !next }));
    }
  };

  const items = EQUIPMENT.filter((item) => item !== "corpo_libero");

  return (
    <View style={styles.root}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("gym.equipment_hint")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={styles.chips}
      >
        {items.map((item) => (
          <Chip
            key={item}
            label={t(`gym.equipment.${item}`)}
            // Un attrezzo mai toccato conta come disponibile: solo "false"
            // esplicito lo spegne.
            active={state[item] !== false}
            onPress={() => toggle(item)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: theme.spacing.xs },
  hint: { fontSize: 12, lineHeight: 16, paddingHorizontal: theme.spacing.md },
  scroll: { flexGrow: 0 },
  chips: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
});
