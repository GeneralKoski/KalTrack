import { ScreenBackground } from "@/src/components/kal";
import { useAppTheme } from "@/src/components/ThemeContext";
import { DfButton } from "@/src/components/form/DfButton";
import { Text } from "@/src/components/ui";
import {
  resolveBarcode,
  type BarcodeResolution,
} from "@/src/containers/foods/resolveBarcode";
import { useAppNav } from "@/src/hooks/useAppNav";
import { useTranslation } from "@/src/hooks/useTranslation";
import { theme } from "@/src/styles";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { ChevronLeft, ScanBarcode } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Solo i formati da supermercato.
 *
 * Lasciare tutti i tipi vuol dire che la fotocamera legge anche il QR sul
 * volantino accanto e prova a risolverlo come se fosse un prodotto.
 */
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

/**
 * La fotocamera che legge un codice a barre.
 *
 * Tutta l'infrastruttura c'era da sempre - la colonna `foods.barcode` con il
 * suo indice, `getFoodByBarcode`, `searchByBarcode` - e **nessuna schermata
 * scansionava niente**: `expo-camera` era installato con zero import in tutto
 * il progetto. Era la catena completa dell'inserimento piu' veloce che un'app
 * di questo tipo possa avere, mancando l'ultimo anello.
 *
 * La schermata e' sottile per scelta: le decisioni stanno in `resolveBarcode`,
 * perche' una fotocamera non si esercita in jest e un emulatore non legge
 * codici. Qui restano il permesso, il fermo alla prima lettura e la
 * navigazione.
 */
export function FoodScanScreen() {
  const { t } = useTranslation();
  const { goBack, replace } = useAppNav();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  /*
   * `onBarcodeScanned` scatta in continuo finche' il codice e' inquadrato.
   * Senza questo fermo lo stesso prodotto si risolve dieci volte, e nel ramo
   * dell'archivio vuol dire dieci righe identiche in libreria. Un ref e non
   * uno stato: deve chiudersi nello stesso giro dell'evento, non al render
   * successivo.
   */
  const letto = useRef(false);

  const onScanned = async (result: BarcodeScanningResult) => {
    if (letto.current) return;
    letto.current = true;
    setBusy(true);

    let esito: BarcodeResolution;
    try {
      esito = await resolveBarcode(result.data);
    } catch (error) {
      logger.error("[barcode] risoluzione fallita", error);
      showToast.error({ title: t("food_scan.failed") });
      // Il fermo si riapre: il difetto e' nostro, non del codice inquadrato,
      // e chiudere la fotocamera lascerebbe l'utente senza niente da fare.
      letto.current = false;
      setBusy(false);
      return;
    }

    /*
     * `replace` e non `navigate`: l'indietro dal modulo deve tornare ad
     * Alimenti, non alla fotocamera. Tornando alla fotocamera si rileggerebbe
     * lo stesso codice - il prodotto e' ancora in mano - e si riaprirebbe il
     * modulo appena chiuso.
     */
    if (esito.kind === "unknown") {
      showToast.info({ title: t("food_scan.not_found") });
      replace("FoodForm", { barcode: esito.barcode });
      return;
    }
    if (esito.kind === "off") {
      showToast.success({ title: t("food_scan.imported") });
    }
    replace("FoodForm", { id: esito.id });
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />

      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={(result) => void onScanned(result)}
        />
      ) : null}

      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.6}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel={t("back")}
        >
          <ChevronLeft size={26} color={theme.colors.white} />
        </TouchableOpacity>

        {permission?.granted ? (
          <View style={styles.center} pointerEvents="none">
            {/* Il riquadro dice DOVE inquadrare: senza, si punta il centro
                dello schermo e il codice resta fuori dal fuoco. */}
            <View style={styles.frame} />
            <Text style={styles.hint}>
              {busy ? t("food_scan.resolving") : t("food_scan.hint")}
            </Text>
            {busy ? (
              <ActivityIndicator
                color={theme.colors.white}
                style={styles.spinner}
              />
            ) : null}
          </View>
        ) : (
          /*
           * Permesso assente o negato: uno stato che dice cosa manca e come
           * darlo. Una fotocamera nera sembrerebbe un difetto dell'app.
           */
          <View style={styles.center}>
            <ScanBarcode size={44} color={colors.textFaint} />
            <Text style={[styles.title, { color: colors.text }]}>
              {t("food_scan.permission_title")}
            </Text>
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {t("food_scan.permission_message")}
            </Text>
            <DfButton
              label={
                permission?.canAskAgain === false
                  ? t("food_scan.open_settings")
                  : t("food_scan.allow")
              }
              onPress={() => {
                if (permission?.canAskAgain === false) {
                  void Linking.openSettings();
                  return;
                }
                void requestPermission();
              }}
              style={styles.button}
            />
          </View>
        )}
      </SafeAreaView>

      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  back: {
    margin: theme.spacing.md,
    alignSelf: "flex-start",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  frame: {
    width: "78%",
    aspectRatio: 1.6,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.white,
    opacity: 0.85,
  },
  hint: {
    marginTop: theme.spacing.md,
    color: theme.colors.white,
    fontSize: 14,
    textAlign: "center",
  },
  spinner: {
    marginTop: theme.spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: theme.spacing.sm,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
  },
  button: {
    marginTop: theme.spacing.md,
  },
});
