import { hasBackend } from "@/src/api/config";
import * as social from "@/src/api/social";
import {
  createExercise,
  findExerciseByName,
} from "@/src/db/queries/exercises";
import { normalizeText } from "@/src/domain/text";
import { useAccountStore } from "@/src/stores/accountStore";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Equipment,
  type MuscleGroup,
} from "@/src/types/gym";
import { logger } from "@/src/utils/logger";

/**
 * Il catalogo comune degli esercizi.
 *
 * E' L'UNICA COSA DELL'APP CHE ESCE VERSO CHI NON E' AMICO: un esercizio
 * creato a mano finisce nell'elenco di tutti gli iscritti, e chi lo crea deve
 * saperlo prima di scriverlo, non dopo (vedi il testo in
 * `ExerciseFormSheet`).
 *
 * Quel che viaggia e' il minimo che serve a riconoscere un esercizio: nome,
 * gruppo muscolare, attrezzi. Le note, le istruzioni e "quanto mi sta
 * antipatico" restano sul telefono - sono giudizi personali su un esercizio,
 * non la sua descrizione.
 */

const equipmentToString = (equipment: Equipment[]): string =>
  equipment.join(",");

/**
 * Gli attrezzi che arrivano dal catalogo, tenendo solo quelli che conosciamo.
 *
 * Un valore che non e' nell'elenco chiuso viene buttato invece di essere
 * salvato: il catalogo e' scritto da altri telefoni, magari con una versione
 * diversa dell'app, e una stringa sconosciuta in colonna girerebbe per l'app
 * come se fosse un attrezzo vero.
 */
const parseEquipment = (value: string | null): Equipment[] =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is Equipment => (EQUIPMENT as readonly string[]).includes(v));

const isMuscleGroup = (value: string): value is MuscleGroup =>
  (MUSCLE_GROUPS as readonly string[]).includes(value);

/**
 * La voce di catalogo con quel nome, se e' mia.
 *
 * Torna null anche quando la voce esiste ma l'ha aggiunta un altro: da qui in
 * poi il chiamante vuole modificarla o toglierla, e su una voce altrui il
 * server risponderebbe 403.
 */
async function miaInCatalogo(
  name: string,
): Promise<social.CatalogExercise | null> {
  const norm = normalizeText(name);
  if (norm === "") return null;

  const voci = await social.searchCatalogExercises(norm);
  return voci.find((v) => v.nameNorm === norm && v.mine) ?? null;
}

/**
 * Propone un esercizio al catalogo di tutti.
 *
 * Non solleva mai e non blocca niente: l'esercizio e' gia' salvato sul
 * telefono quando questa parte, e il catalogo e' un di piu'. Se non c'e' rete
 * o non c'e' un account, l'esercizio resta locale e l'app funziona uguale.
 */
export async function publishToCatalog(input: {
  name: string;
  muscleGroup: MuscleGroup;
  equipment: Equipment[];
}): Promise<void> {
  try {
    if (!hasBackend()) return;
    if (!useAccountStore.getState().token) return;

    await social.addCatalogExercise({
      name: input.name,
      muscleGroup: input.muscleGroup,
      equipment: equipmentToString(input.equipment),
    });
  } catch (error) {
    logger.warn("[palestra] esercizio non proposto al catalogo", error);
  }
}

/**
 * Aggiorna in catalogo un esercizio che si e' corretto qui.
 *
 * `previousName` e' il nome che aveva PRIMA: e' con quello che la voce si
 * ritrova, perche' e' quello con cui era stata pubblicata. Col nome nuovo, una
 * rinomina creerebbe un doppione e lascerebbe in giro la voce vecchia.
 */
export async function updatePublishedExercise(
  previousName: string,
  input: {
    name: string;
    muscleGroup: MuscleGroup;
    equipment: Equipment[];
  },
): Promise<void> {
  try {
    if (!hasBackend()) return;
    if (!useAccountStore.getState().token) return;

    const payload = {
      name: input.name,
      muscleGroup: input.muscleGroup,
      equipment: equipmentToString(input.equipment),
    };

    const voce = await miaInCatalogo(previousName);
    if (!voce) {
      await social.addCatalogExercise(payload);
      return;
    }

    await social.updateCatalogExercise(voce.id, payload);
  } catch (error) {
    logger.warn("[palestra] catalogo non aggiornato", error);
  }
}

/** Toglie dal catalogo un esercizio proprio, se c'e' ed e' proprio. */
export async function unpublishExercise(name: string): Promise<void> {
  try {
    if (!hasBackend()) return;
    if (!useAccountStore.getState().token) return;

    const voce = await miaInCatalogo(name);
    if (voce) await social.deleteCatalogExercise(voce.id);
  } catch (error) {
    logger.warn("[palestra] non tolto dal catalogo", error);
  }
}

/**
 * Porta nel telefono gli esercizi del catalogo che qui non ci sono.
 *
 * Il confronto e' sul NOME normalizzato e non sull'id: gli id nascono su un
 * telefono e sull'altro non vogliono dire niente, mentre il nome e' quel che
 * rende due esercizi lo stesso esercizio - ed e' la stessa regola con cui il
 * server tiene fuori i doppioni.
 *
 * Entrano come `is_custom = 0`: dal punto di vista di questo telefono sono
 * voci di catalogo, non roba che ha inventato chi lo usa.
 *
 * Torna quanti ne ha aggiunti. Non solleva: senza rete la palestra deve
 * funzionare com'e' sempre funzionata.
 */
export async function importCatalog(term = ""): Promise<number> {
  try {
    if (!hasBackend()) return 0;
    if (!useAccountStore.getState().token) return 0;

    const voci = await social.searchCatalogExercises(term);

    let aggiunti = 0;
    for (const voce of voci) {
      if (!isMuscleGroup(voce.muscleGroup)) continue;
      if (await findExerciseByName(voce.name)) continue;

      await createExercise({
        name: voce.name,
        muscleGroup: voce.muscleGroup,
        secondaryMuscles: [],
        equipment: parseEquipment(voce.equipment),
        isCustom: false,
      });
      aggiunti++;
    }

    return aggiunti;
  } catch (error) {
    logger.warn("[palestra] catalogo non importato", error);
    return 0;
  }
}
