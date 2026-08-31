import type { AssistantContext } from "@/src/ai/assistant";
import type { ToolIntent } from "@/src/ai/tools/types";
import { MetalSurface } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { AssistantOverlay } from "@/src/containers/assistant/AssistantOverlay";
import { useAssistantSession } from "@/src/containers/assistant/useAssistantSession";
import {
  entryDisplayNames,
  getDayDiary,
  listMealTypes,
} from "@/src/db/queries/diary";
import { searchFoods } from "@/src/db/queries/foods";
import { searchRecipes } from "@/src/db/queries/recipes";
import { getTargetsFor } from "@/src/db/queries/settings";
import { getSteps } from "@/src/db/queries/tracking";
import { todayIso } from "@/src/domain/date";
import { useTranslation } from "@/src/hooks/useTranslation";
import { useAssistantLaunch } from "@/src/services/assistantLaunch";
import { useAssistantStore } from "@/src/stores/assistantStore";
import { useDayContextStore } from "@/src/stores/dayContextStore";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { Mic } from "lucide-react-native";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const launchRequests = useAssistantLaunch();
  const referenceDate = useDayContextStore((s) => s.referenceDate);

  const buildContext = useCallback((): AssistantContext => contextRef.current, []);
  const contextRef = useRef<AssistantContext>({});
  const session = useAssistantSession(buildContext);

  /**
   * `startListening` cambia identità a ogni cambio di stato della
   * registrazione: metterlo tra le dipendenze farebbe rigirare l'effetto, che
   * riavvierebbe l'ascolto, che cambierebbe di nuovo lo stato. Un loop
   * infinito, non un'ipotesi: l'app lo ha fatto davvero. Il ref tiene la
   * funzione fuori dalle dipendenze, e il contatore delle richieste già
   * servite fa il resto.
   */
  const startListeningRef = useRef(session.startListening);
  startListeningRef.current = session.startListening;
  const servedLaunch = useRef(0);

  // Aperto da fuori (la scorciatoia sull'icona dell'app): chi arriva da lì ha
  // già in testa la frase da dire, quindi si parte ad ascoltare subito.
  useEffect(() => {
    if (launchRequests === 0 || launchRequests === servedLaunch.current) return;
    servedLaunch.current = launchRequests;
    setOpen(true);
    void startListeningRef.current();
  }, [launchRequests]);

  // Il contesto si prepara PRIMA di parlare, non dopo: raccoglierlo mentre il
  // modello aspetta aggiungerebbe latenza proprio nel momento più visibile.
  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      try {
        // Il giorno che l'utente sta guardando, non quello del telefono: chi
        // scorre a ieri e detta una voce se la vedeva scrivere su oggi.
        const date = referenceDate ?? todayIso();
        const [diary, mealTypes, targets, foods, recipes] = await Promise.all([
          getDayDiary(date),
          listMealTypes(),
          getTargetsFor(date),
          searchFoods("", CONTEXT_ITEMS),
          searchRecipes("", CONTEXT_ITEMS),
        ]);
        const [stepLog, names] = await Promise.all([
          getSteps(date),
          entryDisplayNames(diary),
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
            // I passi vanno letti, non messi a zero: con lo zero fisso
            // l'assistente rispondeva "hai fatto 0 passi" a chi ne aveva
            // appena registrati novemila.
            steps: stepLog?.steps ?? 0,
          },
          mealTypes: mealTypes.map((m) => ({ id: m.id, name: m.name })),
          foods: foods.map((f) => ({ id: f.id, name: f.name })),
          recipes: recipes.map((r) => ({ id: r.id, name: r.name })),
          // Il nome della riga e' quello dell'alimento o del pasto, non quello
          // del tipo di pasto: con il ripiego su `meal.type.name` ogni voce si
          // chiamava "Colazione", e "togli il pane" non poteva funzionare.
          entries: diary.meals.flatMap((meal) =>
            meal.entries.map((entry) => ({
              id: entry.id,
              name: names[entry.id] ?? meal.type.name,
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
  }, [open, referenceDate]);

  const resolvePending = session.resolvePending;

  const runIntent = useCallback(
    async (intent: ToolIntent) => {
      // Tolto dalla lista PRIMA di eseguire: l'intento e' stato deciso, e
      // lasciarcelo mentre parte significa mostrarne ancora il tasto Conferma.
      resolvePending(intent);
      try {
        const result = await intent.execute();
        showToast.success({ title: result.message });
      } catch (error) {
        logger.error("[assistant] esecuzione fallita", error);
        showToast.error({ title: t("assistant.execute_failed") });
      }
    },
    [resolvePending, t],
  );

  /**
   * Le azioni gia' auto-confermate partono da sole appena arrivano.
   *
   * Il registro di quelle avviate serve perche' `runIntent` cambia `pending`,
   * l'effetto rigira, e senza guardia una seconda azione automatica dello
   * stesso gruppo verrebbe lanciata due volte.
   */
  const startedRef = useRef(new Set<ToolIntent>());
  useEffect(() => {
    for (const intent of session.pending) {
      if (!isAutoConfirmed(intent.toolName)) continue;
      if (startedRef.current.has(intent)) continue;
      startedRef.current.add(intent);
      void runIntent(intent);
    }
  }, [session.pending, isAutoConfirmed, runIntent]);

  const close = () => {
    setOpen(false);
    startedRef.current = new Set();
    session.reset();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, { bottom: insets.bottom + FAB_OFFSET }]}
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
          // Le altre azioni gia' a schermo restano da confermare a mano:
          // spuntare "non chiedere piu'" su una di esse le faceva partire
          // tutte insieme, senza che nessuno le avesse guardate.
          if (rememberChoice) {
            for (const other of session.pending) {
              if (other !== intent && other.toolName === intent.toolName) {
                startedRef.current.add(other);
              }
            }
            allowAutoConfirm(intent.toolName);
          }
          // Si chiude solo quando non resta piu' niente da decidere: con tre
          // azioni proposte, confermarne una faceva sparire le altre due
          // senza che nessuno le avesse viste.
          const last = session.pending.length <= 1;
          void runIntent(intent);
          if (last) close();
        }}
        onDiscard={(intent) => {
          const last = session.pending.length <= 1;
          resolvePending(intent);
          if (last) close();
        }}
      />
    </>
  );
};

/** Quanto il microfono sta staccato dal fondo della finestra, oltre l'inset. */
const FAB_OFFSET = 88;
/** Lato del microfono. */
const FAB_SIZE = 52;

/**
 * Spazio che ogni schermata scorrevole deve lasciarsi in fondo perché il
 * microfono dell'assistente non copra l'ultima riga di contenuto.
 *
 * È la somma delle misure qui sotto: il bottone sta a 88 dal fondo ed è alto
 * 52, più un margine. Vive accanto al bottone e non nelle schermate perché è
 * il bottone a deciderla: spostarlo senza aggiornare questo numero
 * rimetterebbe il difetto in tutte e dodici le schermate insieme.
 */
export const ASSISTANT_FAB_CLEARANCE = FAB_OFFSET + FAB_SIZE + theme.spacing.md;

/** Lato del "+" delle schermate: più grande del microfono, è l'azione locale. */
export const SCREEN_FAB_SIZE = 56;

/**
 * Dove appoggiare il "+" di una schermata perché stia SOPRA il microfono
 * invece che addosso.
 *
 * Il microfono è montato FUORI dal navigatore, quindi la sua quota si misura
 * dal fondo della finestra; il "+" vive dentro una schermata, che finisce dove
 * inizia la tab bar. Lo stesso `bottom` cade quindi a due altezze diverse a
 * seconda di dove sta la schermata - ed è esattamente così che i due bottoni
 * si sovrapponevano sulla home (dentro i tab) e non su Alimenti (nel root
 * stack). Sottrarre l'altezza della tab bar riporta le due misure nello stesso
 * sistema di riferimento.
 *
 * `BottomTabBarHeightContext` e non `useBottomTabBarHeight()`: l'hook lancia
 * dove la tab bar non c'è, e metà delle schermate con un "+" sono nel root
 * stack.
 */
export function useScreenFabBottom(): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  return Math.max(
    theme.spacing.lg,
    insets.bottom + FAB_OFFSET + FAB_SIZE + theme.spacing.sm - tabBarHeight,
  );
}

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
    width: FAB_SIZE,
    height: FAB_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
