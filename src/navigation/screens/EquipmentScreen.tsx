import { DfButton } from "@/src/components/form/DfButton";
import { Card } from "@/src/components/kal";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  listEquipmentAvailability,
  setEquipmentAvailability,
} from "@/src/db/queries/exercises";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { EQUIPMENT, type Equipment } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";

/**
 * Quali attrezzi ci sono, per generare schede e proporre alternative.
 *
 * Ogni attrezzo parte spuntato, cioe' "disponibile", e si spegne solo quello
 * che manca davvero: partire da zero chiederebbe di spuntare uno per uno tutto
 * quel che si ha. Il corpo libero non compare: c'e' sempre.
 *
 * `setupForRoutine` arriva da "Le mie schede" quando non esiste ancora una
 * scheda: e' li' che l'attrezzatura si dichiara per la prima volta, prima di
 * costruirne una. In quel caso in fondo compare "Continua" verso il modulo
 * scheda; aperta dal profilo e' la modifica libera, senza quel passo in piu'.
 */
export function EquipmentScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { replace } = useAppNav();
  const route =
    useRoute<RouteProp<{ params?: { setupForRoutine?: boolean } }, "params">>();
  const setupForRoutine = route.params?.setupForRoutine ?? false;

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

  const toggle = async (item: Equipment, next: boolean) => {
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
    <SettingsPage title={t("gym.equipment_title")}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("gym.equipment_hint")}
      </Text>

      <Card style={styles.card}>
        {items.map((item) => (
          <View key={item} style={styles.row}>
            <Text style={[styles.name, { color: colors.text }]}>
              {t(`gym.equipment.${item}`)}
            </Text>
            <Switch
              value={state[item] !== false}
              onValueChange={(next) => void toggle(item, next)}
            />
          </View>
        ))}
      </Card>

      {setupForRoutine && (
        <DfButton
          label={t("gym.equipment_continue")}
          // `replace` e non `navigate`: questa schermata deve sparire dalla
          // pila, o il salvataggio della scheda tornerebbe indietro qui
          // invece che all'elenco delle schede.
          onPress={() => replace("RoutineForm")}
          style={styles.continueButton}
        />
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18 },
  card: { gap: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: { fontSize: 15, fontWeight: "500" },
  continueButton: { marginTop: theme.spacing.lg },
});
