import type { AssistantContext } from "@/src/ai/assistant";
import type { ToolIntent } from "@/src/ai/tools/types";
import { MetalSurface } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { AssistantOverlay } from "@/src/containers/assistant/AssistantOverlay";
import { useAssistantSession } from "@/src/containers/assistant/useAssistantSession";
import { getDayDiary, listMealTypes } from "@/src/db/queries/diary";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { getTargetsFor } from "@/src/db/queries/settings";
import { todayIso } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAssistantStore } from "@/src/stores/assistantStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { Mic } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Quanti nomi passare al modello: il contesto deve restare compatto. */
const CONTEXT_ITEMS = 40;

/**
 * Il pulsante mic globale.
 *
 * Vive sopra la navigazione invece che dentro le schermate: l'assistente è uno
 * strato SOPRA l'app e deve essere raggiungibile ovunque, senza che ogni
 * schermata debba ricordarsi di montarlo.
 */
export const AssistantButton: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const isAutoConfirmed = useAssistantStore((s) => s.isAutoConfirmed);
  const allowAutoConfirm = useAssistantStore((s) => s.allowAutoConfirm);

  const buildContext = useCallback((): AssistantContext => contextRef.current, []);
  const contextRef = useRef<AssistantContext>({});
  const session = useAssistantSession(buildContext);

  // Il contesto si prepara PRIMA di parlare, non dopo: raccoglierlo mentre il
  // modello aspetta aggiungerebbe latenza proprio nel momento più visibile.
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        const date = todayIso();
        const [diary, mealTypes, targets, foods, recipes] = await Promise.all([
          getDayDiary(date),
          listMealTypes(),
          getTargetsFor(date),
          searchFoods("", CONTEXT_ITEMS),
          searchRecipes("", CONTEXT_ITEMS),
        ]);
        if (!active) return;

        contextRef.current = {
          date,
          targets: targets
            ? {
                kcal: targets.kcal,
                proteinG: targets.protein_g,
                carbsG: targets.carbs_g,
                fatG: targets.fat_g,
                steps: targets.steps,
              }
            : null,
          consumed: {
            kcal: diary.totals.kcal,
            proteinG: diary.totals.protein,
            carbsG: diary.totals.carbs,
            fatG: diary.totals.fat,
            steps: 0,
          },
          mealTypes: mealTypes.map((m) => ({ id: m.id, name: m.name })),
          foods: foods.map((f) => ({ id: f.id, name: f.name })),
          recipes: recipes.map((r) => ({ id: r.id, name: r.name })),
          entries: diary.meals.flatMap((meal) =>
            meal.entries.map((entry) => ({
              id: entry.id,
              name: entry.label ?? meal.type.name,
              kcal: entry.kcal,
            })),
          ),
        };
      } catch (error) {
        logger.error("[assistant] contesto non costruito", error);
      }
    })();
    return () => {
      active = false;
    };
  }, [open]);

  const runIntent = useCallback(
    async (intent: ToolIntent) => {
      try {
        const result = await intent.execute();
        showToast.success({ title: result.message });
      } catch (error) {
        logger.error("[assistant] esecuzione fallita", error);
        showToast.error({ title: t("assistant.execute_failed") });
      }
    },
    [t],
  );

  // Le azioni già auto-confermate partono da sole appena arrivano.
  useEffect(() => {
    const automatic = session.pending.filter((i) => isAutoConfirmed(i.toolName));
    if (automatic.length === 0) return;
    automatic.forEach(runIntent);
  }, [session.pending, isAutoConfirmed, runIntent]);

  const close = () => {
    setOpen(false);
    session.reset();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { bottom: insets.bottom + 88 }]}
        activeOpacity={0.6}
        onPress={() => {
          setOpen(true);
          void session.startListening();
        }}
        accessibilityLabel={t("assistant.open")}
      >
        <MetalSurface radius={26} style={styles.surface}>
          <Mic size={22} color={colors.text} />
        </MetalSurface>
      </TouchableOpacity>

      <AssistantOverlay
        visible={open}
        session={session}
        onClose={close}
        onConfirm={(intent, rememberChoice) => {
          if (rememberChoice) allowAutoConfirm(intent.toolName);
          void runIntent(intent);
          close();
        }}
        onDiscard={close}
      />
    </>
  );
};

/**
 * Spazio che ogni schermata scorrevole deve lasciarsi in fondo perché il
 * microfono dell'assistente non copra l'ultima riga di contenuto.
 *
 * È la somma delle misure qui sotto: il bottone sta a 88 dal fondo ed è alto
 * 52, più un margine. Vive accanto al bottone e non nelle schermate perché è
 * il bottone a deciderla: spostarlo senza aggiornare questo numero
 * rimetterebbe il difetto in tutte e dodici le schermate insieme.
 */
export const ASSISTANT_FAB_CLEARANCE = 88 + 52 + 16;

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: theme.spacing.md,
    borderRadius: 26,
    shadowColor: theme.colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  surface: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
});
