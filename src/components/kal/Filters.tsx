import { Chip, SectionLabel } from "@/src/components/kal/Primitives";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react-native";
import React, { useState, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

function formatDMY(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Campo intervallo date (da → a) con picker nativo. `label` opzionale:
// se assente, il chiamante fornisce la propria intestazione.
export const DateRangeField: React.FC<{
  label?: string;
  from: Date | null;
  to: Date | null;
  onChangeFrom: (d: Date) => void;
  onChangeTo: (d: Date) => void;
  // Estremi assoluti selezionabili (es. data più vecchia/nuova disponibile).
  minDate?: Date;
  maxDate?: Date;
}> = ({ label, from, to, onChangeFrom, onChangeTo, minDate, maxDate }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [iosField, setIosField] = useState<"from" | "to" | null>(null);
  const [temp, setTemp] = useState<Date>(new Date());

  // "Da" non può superare "A" e viceversa, e nessuno dei due esce dagli
  // estremi assoluti: vincola il range selezionabile.
  const laterOf = (a?: Date, b?: Date) => (a && b ? (a > b ? a : b) : a ?? b);
  const earlierOf = (a?: Date, b?: Date) => (a && b ? (a < b ? a : b) : a ?? b);
  const minFor = (field: "from" | "to") =>
    laterOf(minDate, field === "to" ? from ?? undefined : undefined);
  const maxFor = (field: "from" | "to") =>
    earlierOf(maxDate, field === "from" ? to ?? undefined : undefined);

  const open = (field: "from" | "to") => {
    const base = (field === "from" ? from : to) ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        minimumDate: minFor(field),
        maximumDate: maxFor(field),
        onChange: (event, d) => {
          // Su Android onChange scatta anche all'annullamento (type
          // "dismissed") passando comunque una data: committa solo su "set".
          if (event.type === "set" && d)
            (field === "from" ? onChangeFrom : onChangeTo)(d);
        },
      });
    } else {
      setTemp(base);
      setIosField(field);
    }
  };

  return (
    <View style={styles.group}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <View style={styles.rangeRow}>
        <Pressable
          style={[styles.rangeField, { borderColor: colors.border }]}
          onPress={() => open("from")}
        >
          <Text
            style={[
              styles.rangeText,
              { color: from ? colors.text : colors.textFaint },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {from ? formatDMY(from) : "gg/mm/aaaa"}
          </Text>
          <CalendarDays size={16} color={colors.textFaint} />
        </Pressable>
        <ArrowRight size={16} color={colors.textFaint} />
        <Pressable
          style={[styles.rangeField, { borderColor: colors.border }]}
          onPress={() => open("to")}
        >
          <Text
            style={[
              styles.rangeText,
              { color: to ? colors.text : colors.textFaint },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {to ? formatDMY(to) : "gg/mm/aaaa"}
          </Text>
          <CalendarDays size={16} color={colors.textFaint} />
        </Pressable>
      </View>

      {iosField && (
        <Modal transparent animationType="fade" onRequestClose={() => setIosField(null)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIosField(null)}>
            <Pressable
              style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            >
              <DateTimePicker
                value={temp}
                mode="date"
                display="inline"
                minimumDate={minFor(iosField)}
                maximumDate={maxFor(iosField)}
                onChange={(_e, d) => d && setTemp(d)}
              />
              <View style={styles.modalActions}>
                <Pressable onPress={() => setIosField(null)}>
                  <Text style={[styles.modalCancel, { color: colors.textMuted }]}>
                    {t("cancel")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (iosField)
                      (iosField === "from" ? onChangeFrom : onChangeTo)(temp);
                    setIosField(null);
                  }}
                >
                  <Text style={styles.modalOk}>{t("ok")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

// Bottone filtro (funnel) per l'header, con badge del numero di filtri attivi.
// A differenza degli altri bottoni header, il cerchio di sfondo e' sempre
// visibile e al tap si applica la trasparenza (activeOpacity).
export const FilterButton: React.FC<{
  activeCount: number;
  onPress: () => void;
}> = ({ activeCount, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    style={styles.filterBtn}
    hitSlop={8}
  >
    <Filter size={20} color={theme.colors.white} />
    {activeCount > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{activeCount}</Text>
      </View>
    )}
  </TouchableOpacity>
);

export interface FilterOption {
  code: string;
  label: string;
  dotColor?: string;
  // data URI della bandiera (nazionalità): mostrata come icona nella lista.
  flagUri?: string;
}

// Gruppo di chip multi-selezione con etichetta di sezione (bottom-sheet filtri).
export const FilterChipGroup: React.FC<{
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (code: string) => void;
}> = ({ label, options, selected, onToggle }) => {
  if (options.length === 0) return null;
  // Se le opzioni hanno un pallino colorato (es. stato documento) il chip
  // selezionato si colora con quel colore e il pallino diventa bianco.
  const variant = options.some((o) => o.dotColor) ? "dot" : "primary";
  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <View style={styles.chips}>
        {options.map((opt) => (
          <Chip
            key={opt.code}
            label={opt.label}
            active={selected.includes(opt.code)}
            dotColor={opt.dotColor}
            variant={variant}
            onPress={() => onToggle(opt.code)}
          />
        ))}
      </View>
    </View>
  );
};

// Campo picker multi-selezione (mockup 11/13/21/23): mostra il riepilogo della
// selezione e, al tap, espande inline la lista delle opzioni con spunta.
export const PickerField: React.FC<{
  label: string;
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (code: string) => void;
  icon?: ReactNode;
}> = ({ label, placeholder, options, selected, onToggle, icon }) => {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  if (options.length === 0) return null;

  const chosen = options.filter((o) => selected.includes(o.code));
  const summary =
    chosen.length === 0
      ? placeholder
      : chosen.length === 1
        ? chosen[0].label
        : `${chosen[0].label} +${chosen.length - 1}`;

  return (
    <View style={styles.group}>
      <SectionLabel>{label}</SectionLabel>
      <TouchableOpacity
        style={[styles.pickerField, { borderColor: colors.border }]}
        activeOpacity={0.6}
        onPress={() => setOpen((v) => !v)}
      >
        {icon}
        <Text
          style={[
            styles.pickerText,
            { color: chosen.length === 0 ? colors.textFaint : colors.text },
          ]}
          numberOfLines={1}
        >
          {summary}
        </Text>
        {open ? (
          <ChevronDown size={18} color={colors.textFaint} />
        ) : (
          <ChevronRight size={18} color={colors.textFaint} />
        )}
      </TouchableOpacity>

      {open && (
        <View style={[styles.pickerList, { borderColor: colors.border }]}>
          {options.map((opt) => {
            const active = selected.includes(opt.code);
            return (
              <TouchableOpacity
                key={opt.code}
                style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                activeOpacity={0.6}
                onPress={() => onToggle(opt.code)}
              >
                {opt.dotColor ? (
                  <View style={[styles.pickerDot, { backgroundColor: opt.dotColor }]} />
                ) : null}
                <Text
                  style={[
                    styles.pickerRowText,
                    { color: active ? colors.text : colors.textSecondary },
                    active && styles.pickerRowTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {opt.label}
                </Text>
                {active ? <Check size={18} color={theme.colors.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};

// Footer con azioni Reset / Applica (mockup 11/13/21/23).
export const FilterActions: React.FC<{
  onReset: () => void;
  onApply: () => void;
}> = ({ onReset, onApply }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[
          styles.btn,
          styles.reset,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
        activeOpacity={0.6}
        onPress={onReset}
      >
        <Text style={[styles.resetText, { color: colors.textSecondary }]}>
          {t("reset")}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, styles.apply]}
        activeOpacity={0.6}
        onPress={onApply}
      >
        <Text style={styles.applyText}>{t("apply")}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.warning,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: theme.colors.white, fontSize: 11, fontWeight: "700" },
  group: { marginBottom: theme.spacing.sm },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.md,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    borderRadius: theme.radius.lg,
  },
  reset: {
    borderWidth: 1,
  },
  resetText: { fontSize: 15, fontWeight: "700" },
  apply: { backgroundColor: theme.colors.primary },
  applyText: { fontSize: 15, fontWeight: "700", color: theme.colors.white },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  rangeField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 12,
  },
  rangeText: { flexShrink: 1, fontSize: 15 },
  pickerField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    marginTop: theme.spacing.sm,
  },
  pickerText: { flex: 1, fontSize: 15 },
  pickerList: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.xs,
    overflow: "hidden",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  pickerDot: { width: 8, height: 8, borderRadius: 4 },
  pickerRowText: { flex: 1, fontSize: 15 },
  pickerRowTextActive: { fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  modalSheet: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  modalCancel: { fontSize: 16, fontWeight: "600" },
  modalOk: { fontSize: 16, fontWeight: "700", color: theme.colors.primary },
});
