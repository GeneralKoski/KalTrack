import { DfButton } from "@/src/components/form/DfButton";
import { EmptyState, ListGroup, ListRow } from "@/src/components/kal";
import { SettingsPage } from "@/src/containers/settings/SettingsPage";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import {
  listEquipmentAvailability,
  setEquipmentAvailability,
} from "@/src/db/queries/exercises";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useTaxonomyStore } from "@/src/stores/taxonomyStore";
import { theme } from "@/src/styles";
import type { Equipment } from "@/src/types/gym";
import { logger } from "@/src/utils/logger";
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch } from "react-native";
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
  const equipmentLabel = useTaxonomyStore((s) => s.equipmentLabel);
  const liveEquipment = useTaxonomyStore((s) => s.liveEquipment);
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

  const items = liveEquipment.filter((riga) => riga.slug !== "corpo_libero");

  return (
    <SettingsPage title={t("gym.equipment_title")}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("gym.equipment_hint")}
      </Text>

      {items.length === 0 ? (
        // Un `hydrate()` fallito lascia la tassonomia vuota in memoria: un
        // riquadro vuoto sembrerebbe un difetto dell'app, questo dice che i
        // dati non sono arrivati.
        <EmptyState message={t("gym.taxonomy_unavailable")} compact />
      ) : (
        // Un blocco, non una card con dentro righe distanziate: cosi'
        // l'elenco ha lo stesso ritmo e la stessa linea di tutti gli altri
        // elenchi dell'app.
        <ListGroup indent={theme.spacing.md}>
          {items.map((riga) => (
            <ListRow
              key={riga.slug}
              label={equipmentLabel(riga.slug)}
              right={
                <Switch
                  value={state[riga.slug] !== false}
                  onValueChange={(next) => void toggle(riga.slug, next)}
                />
              }
            />
          ))}
        </ListGroup>
      )}

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
  continueButton: { marginTop: theme.spacing.lg },
});
