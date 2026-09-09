import { DfBottomSheet } from "@/src/components/DfBottomSheet";
import { ListGroup, ListRow } from "@/src/components/kal/ListGroup";
import { SyncedPhoto } from "@/src/components/kal/SyncedPhoto";
import { useAppTheme } from "@/src/components/ThemeContext";
import { Text } from "@/src/components/ui";
import { useTranslation } from "@/src/hooks/useTranslation";
import { discardPhoto, persistPhoto } from "@/src/services/photoStorage";
import { showToast } from "@/src/utils/toast";
import { theme } from "@/src/styles";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Trash2, X } from "lucide-react-native";
import React, { useRef } from "react";
import {
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";

/**
 * Le due anteprime passano da `SyncedPhoto`, e non dall'`Image` di React
 * Native.
 *
 * Erano le ultime due superfici fotografiche dell'app a non farlo - elenco
 * alimenti, valori per cento grammi, ricette, esercizi, foto progressi e
 * confronto ci passavano tutte - e questo e' il posto dove costava di piu':
 * una foto scattata su un altro telefono arriva qui come percorso di un file
 * che qui non c'e', e l'`Image` di RN in quel caso non disegna niente. Un
 * riquadro nero, senza un errore da nessuna parte.
 *
 * `SyncedPhoto` risponde alle due domande che quell'`Image` non si poneva: il
 * file e' su QUESTO telefono? se no, si puo' scaricare? e finche' non c'e'
 * mette il segnaposto - che dice che la foto esiste e non e' ancora arrivata,
 * invece di far sembrare rotta la tessera (`CLAUDE.md` § Le foto).
 */

/**
 * Il ritaglio, verticale per tutti.
 *
 * Era `[4, 3]` - orizzontale - e non era una decisione: il componente e' nato
 * per gli alimenti e le ricette, dove un piatto sta bene disteso, ed e' quello
 * l'esempio nella documentazione di expo-image-picker. Poi lo hanno riusato
 * esercizi e foto progressi senza riaprire la domanda, e un corpo fotografato
 * in 4:3 lo si taglia alle ginocchia.
 *
 * L'anteprima segue questo stesso rapporto (`height` decide quanto e' alta, la
 * larghezza viene di conseguenza): prima era larga quanto la schermata e alta
 * 160, cioe' circa 2:1, e non corrispondeva ne' al ritaglio vecchio ne' a
 * questo.
 */
const PHOTO_ASPECT: [number, number] = [3, 4];

/**
 * Scegliere e archiviare una foto.
 *
 * La copia in archivio permanente avviene QUI e non nei chiamanti: ImagePicker
 * restituisce un URI nella cache, che il sistema svuota quando vuole. Farlo in
 * un posto solo significa che nessuna schermata futura può dimenticarsene e
 * ritrovarsi con foto sparite.
 */
function usePhotoPicker(
  uri: string | null,
  onChange: (uri: string | null) => void,
  prefix: string,
) {
  const { t } = useTranslation();

  const store = async (pickedUri: string) => {
    const stored = await persistPhoto(pickedUri, prefix);
    // La foto che stiamo sostituendo non serve piu' a nessuno: senza questa
    // riga restava in archivio per sempre, senza nessun riferimento.
    if (uri && uri !== stored) void discardPhoto(uri);
    onChange(stored);
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      allowsEditing: true,
      aspect: PHOTO_ASPECT,
    });
    if (!result.canceled && result.assets[0]) await store(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // Un `return` muto lasciava credere che il tocco non fosse arrivato:
      // chi ha negato il permesso deve sapere che deve concederlo lui.
      showToast.error({ title: t("photo.camera_denied") });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: true,
      aspect: PHOTO_ASPECT,
    });
    if (!result.canceled && result.assets[0]) await store(result.assets[0].uri);
  };

  const remove = () => {
    if (!uri) return;
    void discardPhoto(uri);
    onChange(null);
  };

  return { pickFromLibrary, takePhoto, remove };
}

interface PhotoFieldProps {
  uri: string | null;
  onChange: (uri: string | null) => void;
  /**
   * Altezza dell'anteprima. Più bassa dove la foto è un dettaglio.
   *
   * Decide anche la larghezza, che segue `PHOTO_ASPECT`: prima l'anteprima
   * prendeva tutta la riga e questo numero era solo la sua altezza.
   */
  height?: number;
  /** Prefisso del file archiviato, per riconoscerlo: "food", "recipe", "progress". */
  prefix?: string;
}

/**
 * Selettore foto con anteprima: ricette, esercizi, foto progressi.
 * Offre sia galleria sia fotocamera - un prodotto lo si fotografa sul momento,
 * un piatto quasi sempre lo si ha già in galleria.
 *
 * Dove la foto è un dettaglio e non il contenuto della schermata c'è
 * `PhotoTile`, che occupa un quadrato invece di due riquadri a mezza pagina.
 */
export const PhotoField: React.FC<PhotoFieldProps> = ({
  uri,
  onChange,
  height = 160,
  prefix = "photo",
}) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { pickFromLibrary, takePhoto, remove } = usePhotoPicker(
    uri,
    onChange,
    prefix,
  );

  if (uri) {
    return (
      <View style={styles.preview}>
        {/*
          La cornice si dimensiona sull'immagine e non sulla schermata: la "X"
          e' ancorata a lei, e su un contenitore a tutta larghezza sarebbe
          finita nel vuoto accanto alla foto.
        */}
        <View
          style={{
            height,
            width: (height * PHOTO_ASPECT[0]) / PHOTO_ASPECT[1],
          }}
        >
          <SyncedPhoto uri={uri} style={styles.image} placeholderSize={28} />
          <TouchableOpacity
            style={styles.remove}
            onPress={remove}
            activeOpacity={0.6}
            hitSlop={8}
          >
            <X size={16} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.action, { borderColor: colors.border }]}
        onPress={pickFromLibrary}
        activeOpacity={0.6}
      >
        <ImagePlus size={20} color={colors.textMuted} />
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
          {t("photo.from_gallery")}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.action, { borderColor: colors.border }]}
        onPress={takePhoto}
        activeOpacity={0.6}
      >
        <Camera size={20} color={colors.textMuted} />
        <Text style={[styles.actionLabel, { color: colors.textMuted }]}>
          {t("photo.take")}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

/** Lato della tessera: la stessa altezza dei due campi che le stanno accanto. */
const TILE_SIZE = 64;

/**
 * La foto come tessera, per i moduli in cui è un dettaglio.
 *
 * Nel modulo di un alimento il lavoro è digitare numeri, e la foto del prodotto
 * si prendeva due riquadri tratteggiati alti 88 con due etichette - una delle
 * quali, "Dalla galleria", compariva di nuovo duecento pixel più in basso per
 * dire tutt'altro (la foto dell'ETICHETTA da leggere con l'OCR). Due comandi
 * con lo stesso nome nella stessa schermata: qui la tessera non ne scrive
 * nessuno, e le due vie stanno dentro il foglio che apre.
 */
export const PhotoTile: React.FC<{
  uri: string | null;
  onChange: (uri: string | null) => void;
  prefix?: string;
  /** Il testo sotto l'icona quando la tessera è vuota. */
  label: string;
  style?: StyleProp<ViewStyle>;
}> = ({ uri, onChange, prefix = "photo", label, style }) => {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const sheet = useRef<BottomSheetModal>(null);
  const { pickFromLibrary, takePhoto, remove } = usePhotoPicker(
    uri,
    onChange,
    prefix,
  );

  /** Il foglio si chiude PRIMA di aprire fotocamera o galleria, o resterebbe
   *  sotto la schermata di sistema e si ritroverebbe aperto al ritorno. */
  const run = (action: () => void) => () => {
    sheet.current?.dismiss();
    action();
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => sheet.current?.present()}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.tile,
          uri
            ? null
            : {
                borderColor: colors.border,
                borderWidth: 1,
                borderStyle: "dashed",
              },
          style,
        ]}
      >
        {uri ? (
          <SyncedPhoto uri={uri} style={styles.tileImage} />
        ) : (
          <>
            <Camera size={18} color={colors.textFaint} />
            <Text style={[styles.tileLabel, { color: colors.textFaint }]}>
              {label}
            </Text>
          </>
        )}
      </TouchableOpacity>

      <DfBottomSheet ref={sheet} title={label}>
        <ListGroup indent={theme.spacing.md}>
          <ListRow
            label={t("photo.take")}
            icon={<Camera size={18} color={colors.textMuted} />}
            onPress={run(() => void takePhoto())}
            chevron={false}
          />
          <ListRow
            label={t("photo.from_gallery")}
            icon={<ImagePlus size={18} color={colors.textMuted} />}
            onPress={run(() => void pickFromLibrary())}
            chevron={false}
          />
          {uri ? (
            <ListRow
              label={t("photo.remove")}
              icon={<Trash2 size={18} color={theme.colors.error} />}
              labelColor={theme.colors.error}
              onPress={run(remove)}
              chevron={false}
            />
          ) : null}
        </ListGroup>
      </DfBottomSheet>
    </>
  );
};

const styles = StyleSheet.create({
  preview: { alignItems: "center" },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.xl,
  },
  remove: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: theme.radius.full,
    padding: 6,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  action: {
    flex: 1,
    height: 88,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  },
  actionLabel: {
    fontSize: 13,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    overflow: "hidden",
  },
  tileImage: { width: "100%", height: "100%" },
  tileLabel: { fontSize: 10 },
});
