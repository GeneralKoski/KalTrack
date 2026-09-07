import { DfAlert } from "@/src/components/DfAlert";
import { FormScreen } from "@/src/components/FormScreen";
import { DfButton } from "@/src/components/form/DfButton";
import { DfForm } from "@/src/components/form/DfForm";
import { DfInput } from "@/src/components/form/DfInput";
import { DfNumberInput } from "@/src/components/form/DfNumberInput";
import { DfSwitch } from "@/src/components/form/DfSwitch";
import {
  PhotoTile,
  ScreenBackground,
  SectionLabel,
} from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { LabelScanner } from "@/src/containers/foods/LabelScanner";
import { NutrientFields } from "@/src/containers/foods/NutrientFields";
import { createFood, deleteFood, getFood, updateFood } from "@/src/db/queries/foods";
import {
  publishFood,
  unpublishFood,
  updatePublishedFood,
} from "@/src/services/foodCatalog";
import { hasBackend } from "@/src/api/config";
import { useAccountStore } from "@/src/stores/accountStore";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import type { FoodRow } from "@/src/types/nutrition";
import { showToast } from "@/src/utils/toast";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { ChevronLeft, Trash2 } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface FoodFormValues {
  name: string;
  brand: string;
  kcal: number;
  protein: number;
  carbs: number;
  sugars: number;
  fat: number;
  saturatedFat: number;
  fiber: number;
  salt: number;
  isLiquid: boolean;
  defaultServingG: number | null;
  servingLabel: string;
}

const EMPTY_VALUES: FoodFormValues = {
  name: "",
  brand: "",
  kcal: 0,
  protein: 0,
  carbs: 0,
  sugars: 0,
  fat: 0,
  saturatedFat: 0,
  fiber: 0,
  salt: 0,
  isLiquid: false,
  defaultServingG: null,
  servingLabel: "",
};

const toValues = (row: FoodRow): FoodFormValues => ({
  name: row.name,
  brand: row.brand ?? "",
  kcal: row.kcal,
  protein: row.protein,
  carbs: row.carbs,
  sugars: row.sugars,
  fat: row.fat,
  saturatedFat: row.saturated_fat,
  fiber: row.fiber,
  salt: row.salt,
  isLiquid: row.is_liquid === 1,
  defaultServingG: row.default_serving_g,
  servingLabel: row.serving_label ?? "",
});

/**
 * DfNumberInput NON tiene nel form il testo che si vede a schermo: la sua
 * `parseToNumber` converte la virgola in punto, quindi digitando "3,2" nel form
 * finisce la stringa "3.2".
 *
 * Riapplicare qui la normalizzazione italiana toglieva quel punto e leggeva 32
 * al posto di 3,2: ogni valore decimale scritto a mano finiva a database
 * moltiplicato per dieci, mentre il campo continuava a mostrare "3,2". Qui
 * serve solo la conversione a numero.
 */
const num = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function FoodFormScreen() {
  const { t } = useTranslation();
  const { goBack } = useAppNav();
  const { colors } = useAppTheme();
  const route =
    useRoute<
      RouteProp<{ params: { id?: string; barcode?: string } }, "params">
    >();
  const id = route.params?.id;
  /*
   * Il codice appena letto dalla fotocamera, quando ne' la libreria ne'
   * l'archivio conoscevano il prodotto. Arriva solo su un modulo nuovo: su uno
   * esistente il codice e' quello della riga, e `updateFood` non lo tocca.
   */
  const barcode = route.params?.barcode?.trim() || null;

  const [initial, setInitial] = useState<FoodFormValues | null>(
    id ? null : EMPTY_VALUES,
  );
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const token = useAccountStore((state) => state.token);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      const row = await getFood(id);
      if (!active) return;
      setInitial(row ? toValues(row) : EMPTY_VALUES);
      setPhotoUri(row?.image_uri ?? null);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const condiviso = hasBackend() && token !== null;

  const onSubmit = async (values: FoodFormValues) => {
    const input = {
      name: values.name.trim(),
      brand: values.brand.trim() || null,
      nutrients: {
        ...EMPTY_NUTRIENTS,
        kcal: num(values.kcal),
        protein: num(values.protein),
        carbs: num(values.carbs),
        sugars: num(values.sugars),
        fat: num(values.fat),
        saturatedFat: num(values.saturatedFat),
        fiber: num(values.fiber),
        salt: num(values.salt),
      },
      isLiquid: values.isLiquid,
      defaultServingG: values.defaultServingG ? num(values.defaultServingG) : null,
      servingLabel: values.servingLabel.trim() || null,
      imageUri: photoUri,
    };

    if (id) {
      // Il nome di PRIMA serve a ritrovare la voce in catalogo: e' quello con
      // cui era stata pubblicata, e cercarla col nome nuovo lascerebbe in giro
      // la vecchia col nome sbagliato.
      const nomePrecedente = initial?.name ?? input.name;
      await updateFood(id, input);
      void updatePublishedFood(nomePrecedente, input);
    } else {
      // Il codice a barre solo in creazione: e' l'identita' della riga e il
      // modulo non ha un campo per cambiarlo. Senza questa riga il terzo esito
      // della scansione non servirebbe a niente - il prodotto entrerebbe in
      // libreria senza codice, e la scansione successiva lo cercherebbe di
      // nuovo in archivio invece di trovarlo qui.
      await createFood({ ...input, barcode });
      void publishFood(input);
    }
    showToast.success({ title: t("foods.saved") });
    goBack();
  };

  const onDelete = async () => {
    if (!id) return;
    const nome = initial?.name;
    await deleteFood(id);
    // Toglie anche dal catalogo comune, ma solo se la voce e' propria: il
    // servizio non prova nemmeno a toccare quella di un altro.
    if (nome) void unpublishFood(nome);
    setConfirmDelete(false);
    showToast.success({ title: t("foods.deleted") });
    goBack();
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} activeOpacity={0.6} hitSlop={10}>
            <ChevronLeft size={26} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {id ? t("foods.edit_title") : t("foods.new_title")}
          </Text>
        </View>

        {!initial ? (
          <ActivityIndicator style={styles.loader} color={colors.accent} />
        ) : (
          <FormScreen contentContainerStyle={styles.content} bottomSpacing={theme.spacing.lg}>
            {/*
              Prima del modulo e non dopo il salvataggio: quel che si scrive
              qui entra nell'elenco alimenti di tutti gli iscritti, e un
              alimento sbagliato in catalogo falsa il diario di chiunque lo
              usi. Senza account non esce niente e il testo non compare.
            */}
            {condiviso ? (
              <Text style={[styles.notice, { color: colors.textMuted }]}>
                {t("foods.catalog_notice")}
              </Text>
            ) : null}

            <DfForm<FoodFormValues>
              initialValues={initial}
              onSubmit={onSubmit}
              submitLabel={t("save")}
            >
              {/*
                La foto accanto al nome, non in una sezione sua.
                Era un'etichetta di sezione piu' due riquadri tratteggiati alti
                140, cioe' mezza pagina per un dettaglio, in un modulo il cui
                lavoro e' digitare numeri - e uno dei due riquadri si chiamava
                "Dalla galleria", lo stesso nome dell'azione che piu' sotto
                sceglie la foto dell'ETICHETTA.
              */}
              <View style={styles.identity}>
                <PhotoTile
                  uri={photoUri}
                  onChange={setPhotoUri}
                  prefix="food"
                  label={t("foods.photo")}
                  style={styles.identityTile}
                />
                <View style={styles.identityField}>
                  <DfInput
                    name="name"
                    label={t("foods.name")}
                    rules={{ required: t("required_field") }}
                  />
                </View>
              </View>

              <DfInput name="brand" label={t("foods.brand")} />

              <SectionLabel>{t("foods.values_per_100")}</SectionLabel>
              <LabelScanner />
              <NutrientFields />

              <SectionLabel>{t("foods.serving")}</SectionLabel>
              <DfSwitch name="isLiquid" label={t("foods.is_liquid")} />
              <DfNumberInput
                name="defaultServingG"
                label={t("foods.default_serving")}
                decimals={0}
              />
              <DfInput
                name="servingLabel"
                label={t("foods.serving_label")}
                placeholder={t("foods.serving_label_placeholder")}
              />
            </DfForm>

            {id ? (
              <DfButton
                label={t("delete")}
                variant="outlined"
                color={theme.colors.error}
                icon={<Trash2 size={18} color={theme.colors.error} />}
                onPress={() => setConfirmDelete(true)}
                style={styles.deleteButton}
              />
            ) : null}
          </FormScreen>
        )}
      </SafeAreaView>

      <DfAlert
        isOpen={confirmDelete}
        title={t("foods.delete_title")}
        message={t("foods.delete_message")}
        confirmLabel={t("delete")}
        confirmColor={theme.colors.error}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: theme.spacing.sm,
  },
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
  },
  content: {
    flexGrow: 1,
    padding: theme.spacing.md,
  },
  // La tessera si allinea in basso col campo e non al centro: `DfInput` porta
  // sopra l'etichetta e sotto un margine, quindi centrare la riga alzerebbe la
  // tessera di mezzo margine rispetto al riquadro del nome.
  identity: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm + 4,
  },
  identityTile: { marginBottom: theme.spacing.md },
  identityField: { flex: 1 },
  loader: {
    marginTop: theme.spacing.xl,
  },
  deleteButton: {
    marginTop: theme.spacing.lg,
  },
});
