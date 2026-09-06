import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { DfButton } from "@/src/components/form/DfButton";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import type { ProgressPhotoRow } from "@/src/db/queries/wellbeing";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { formatDate } from "@/src/utils/dateUtils";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ScrollView } from "react-native-gesture-handler";
import { Check } from "lucide-react-native";
import React, { forwardRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

/** Le miniature di anteprima per giornata: oltre, la riga diventa una lista. */
const THUMBS = 3;

interface ComparePickerSheetProps {
  /** Tutte le foto, gia' ordinate dalla piu' recente. */
  photos: ProgressPhotoRow[];
  onCompare: (first: string, last: string) => void;
}

/**
 * Sceglie le due giornate da confrontare.
 *
 * Si scelgono fra i giorni che **hanno** delle foto e non da un calendario: un
 * confronto con una giornata vuota non e' un confronto, e lasciarlo scegliere
 * vorrebbe dire aprire una schermata per dire che li' non c'e' niente.
 *
 * Prima il confronto non si sceglieva affatto: una card in cima affiancava la
 * foto piu' vecchia e la piu' recente, quali che fossero le pose - un fronte
 * accanto a un retro non dice niente di come sei cambiato.
 */
export const ComparePickerSheet = forwardRef<
  BottomSheetModal,
  ComparePickerSheetProps
>(({ photos, onCompare }, ref) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  /* Le date in ordine, dalla piu' recente: `photos` arriva gia' ordinata. */
  const days: { date: string; items: ProgressPhotoRow[] }[] = [];
  for (const photo of photos) {
    const last = days[days.length - 1];
    if (last && last.date === photo.date) last.items.push(photo);
    else days.push({ date: photo.date, items: [photo] });
  }

  const [picked, setPicked] = useState<string[]>([]);

  const toggle = (date: string) => {
    setPicked((current) => {
      if (current.includes(date)) return current.filter((d) => d !== date);
      // Alla terza scelta la piu' vecchia lascia il posto, invece di non
      // rispondere: chi ne ha gia' due e ne tocca una terza vuole quella.
      return [...current, date].slice(-2);
    });
  };

  const confronta = () => {
    if (picked.length !== 2) return;
    const [a, b] = picked;
    /* `first` e' sempre la piu' vecchia, in qualunque ordine siano state
       toccate: il confronto racconta un prima e un dopo. */
    onCompare(a < b ? a : b, a < b ? b : a);
    setPicked([]);
    if (typeof ref === "object" && ref?.current) ref.current.dismiss();
  };

  return (
    <DfBottomSheet
      ref={ref}
      title={t("progress_photos.compare")}
      onDismiss={() => setPicked([])}
    >
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        {t("progress_photos.compare_hint")}
      </Text>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {days.map((day, index) => {
          const selected = picked.includes(day.date);
          return (
            <TouchableOpacity
              key={day.date}
              onPress={() => toggle(day.date)}
              activeOpacity={0.6}
              style={[
                styles.row,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: index === days.length - 1 ? 0 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.mark,
                  selected
                    ? {
                        backgroundColor: colors.accent,
                        borderColor: colors.accent,
                      }
                    : { borderColor: colors.border },
                ]}
              >
                {selected ? <Check size={13} color={colors.accentOn} /> : null}
              </View>

              <View style={styles.rowText}>
                <Text style={[styles.date, { color: colors.text }]}>
                  {formatDate(day.date)}
                </Text>
                <Text style={[styles.count, { color: colors.textMuted }]}>
                  {t("progress_photos.photo_count", {
                    count: day.items.length,
                  })}
                </Text>
              </View>

              <View style={styles.thumbs}>
                {day.items.slice(0, THUMBS).map((photo) => (
                  <SyncedPhoto
                    key={photo.id}
                    uri={photo.uri}
                    style={[
                      styles.thumb,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                    contentFit="cover"
                  />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <DfButton
        label={t("progress_photos.compare_action")}
        onPress={confronta}
        disabled={picked.length !== 2}
        style={styles.action}
      />
    </DfBottomSheet>
  );
});

ComparePickerSheet.displayName = "ComparePickerSheet";

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18 },
  // Un tetto e non `flex: 1`: dentro un foglio una lista senza altezza propria
  // cresce fino a spingere fuori il bottone.
  list: { maxHeight: 320, marginTop: theme.spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  date: { fontSize: 15, fontWeight: "500" },
  count: { fontSize: 12, marginTop: 1 },
  thumbs: { flexDirection: "row", gap: 3 },
  thumb: { width: 26, height: 34, borderRadius: theme.radius.sm },
  action: { marginTop: theme.spacing.md },
});
