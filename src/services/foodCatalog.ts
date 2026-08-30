import { hasBackend } from "@/src/api/config";
import * as social from "@/src/api/social";
import { createFood, findFoodByName } from "@/src/db/queries/foods";
import { normalizeText } from "@/src/domain/text";
import { EMPTY_NUTRIENTS } from "@/src/domain/nutrition";
import { useAccountStore } from "@/src/stores/accountStore";
import type { FoodInput } from "@/src/types/nutrition";
import { logger } from "@/src/utils/logger";

/**
 * Il catalogo comune degli alimenti.
 *
 * Come quello degli esercizi: quel che si crea a mano entra nell'elenco di
 * tutti gli iscritti, e ciascuno corregge o toglie solo le voci che ha
 * aggiunto lui. Serve anche alle ricette, che sono fatte di alimenti: senza un
 * elenco comune, gli ingredienti di una ricetta condivisa sull'altro telefono
 * sarebbero riferimenti a niente.
 *
 * LA VOCE REMOTA SI RITROVA DAL NOME, non da un id salvato qui. Il telefono
 * potrebbe tenersi l'id del catalogo in colonna, ma quella colonna
 * viaggerebbe nella sincronizzazione e su un secondo dispositivo - o dopo un
 * cambio di account - punterebbe a una riga di un altro server. Il nome
 * normalizzato invece e' la stessa chiave che il server usa per la deduplica,
 * quindi non puo' divergere.
 */

const attivo = (): boolean =>
  hasBackend() && useAccountStore.getState().token !== null;

const toCatalog = (input: FoodInput): social.CatalogFoodInput => ({
  name: input.name,
  brand: input.brand ?? null,
  kcal: input.nutrients.kcal,
  protein: input.nutrients.protein,
  carbs: input.nutrients.carbs,
  sugars: input.nutrients.sugars,
  fat: input.nutrients.fat,
  saturatedFat: input.nutrients.saturatedFat,
  fiber: input.nutrients.fiber,
  salt: input.nutrients.salt,
  isLiquid: input.isLiquid ?? false,
  defaultServingG: input.defaultServingG ?? null,
  servingLabel: input.servingLabel ?? null,
});

/**
 * La voce di catalogo con quel nome, se e' mia.
 *
 * Torna null anche quando la voce esiste ma l'ha aggiunta un altro: da qui in
 * poi il chiamante vuole modificarla o toglierla, e su una voce altrui il
 * server risponderebbe 403. Meglio non chiedere che chiedere e incassare un
 * rifiuto previsto.
 */
async function miaInCatalogo(
  name: string,
): Promise<social.CatalogFood | null> {
  const norm = normalizeText(name);
  if (norm === "") return null;

  const { data } = await social.searchCatalogFoods(norm);
  return data.find((v) => v.nameNorm === norm && v.mine) ?? null;
}

/**
 * Propone un alimento al catalogo di tutti.
 *
 * Non solleva e non blocca: l'alimento e' gia' salvato sul telefono quando
 * questa parte, e senza rete resta comunque utilizzabile.
 */
export async function publishFood(input: FoodInput): Promise<void> {
  try {
    if (!attivo()) return;
    await social.addCatalogFood(toCatalog(input));
  } catch (error) {
    logger.warn("[alimenti] non proposto al catalogo", error);
  }
}

/**
 * Aggiorna in catalogo un alimento che si e' modificato qui.
 *
 * `previousName` e' il nome che aveva PRIMA della modifica: e' con quello che
 * la voce si ritrova, perche' e' quello con cui era stata pubblicata. Usando
 * il nome nuovo, una rinomina creerebbe un doppione e lascerebbe in giro la
 * voce vecchia col nome sbagliato.
 */
export async function updatePublishedFood(
  previousName: string,
  input: FoodInput,
): Promise<void> {
  try {
    if (!attivo()) return;

    const voce = await miaInCatalogo(previousName);
    if (!voce) {
      // Non e' mia o non c'e': la propongo come nuova. Se il nome e' gia'
      // preso da un altro, il server torna la sua e non succede niente.
      await social.addCatalogFood(toCatalog(input));
      return;
    }

    await social.updateCatalogFood(voce.id, toCatalog(input));
  } catch (error) {
    logger.warn("[alimenti] catalogo non aggiornato", error);
  }
}

/** Toglie dal catalogo un alimento proprio, se c'e' ed e' proprio. */
export async function unpublishFood(name: string): Promise<void> {
  try {
    if (!attivo()) return;

    const voce = await miaInCatalogo(name);
    if (voce) await social.deleteCatalogFood(voce.id);
  } catch (error) {
    logger.warn("[alimenti] non tolto dal catalogo", error);
  }
}

/**
 * Porta nel telefono gli alimenti del catalogo che qui non ci sono.
 *
 * Confronto sul nome normalizzato, come per gli esercizi e come fa il server:
 * gli id nascono da una parte e dall'altra non vogliono dire niente.
 */
export async function importFoodCatalog(term = ""): Promise<number> {
  try {
    if (!attivo()) return 0;

    let aggiunti = 0;
    let after: string | undefined;

    // Come per gli esercizi: si continua finche' il server dice che c'e'
    // altro, altrimenti il catalogo si ferma alla prima pagina.
    do {
      const pagina = await social.searchCatalogFoods(term, after);

      for (const voce of pagina.data) {
        if (await findFoodByName(voce.name)) continue;

        await createFood({
          name: voce.name,
          brand: voce.brand,
          nutrients: {
            ...EMPTY_NUTRIENTS,
            kcal: voce.kcal,
            protein: voce.protein,
            carbs: voce.carbs,
            sugars: voce.sugars,
            fat: voce.fat,
            saturatedFat: voce.saturatedFat,
            fiber: voce.fiber,
            salt: voce.salt,
          },
          isLiquid: voce.isLiquid,
          defaultServingG: voce.defaultServingG,
          servingLabel: voce.servingLabel,
        });
        aggiunti++;
      }

      after = pagina.next ?? undefined;
    } while (after);

    return aggiunti;
  } catch (error) {
    logger.warn("[alimenti] catalogo non importato", error);
    return 0;
  }
}
