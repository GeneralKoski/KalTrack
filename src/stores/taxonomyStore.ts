import {
  listAllTaxonomy,
  type TaxonomyRow,
} from "@/src/db/queries/taxonomies";
import { taxonomyLabel } from "@/src/domain/taxonomy";
import { i18n } from "@/src/i18n";
import { logger } from "@/src/utils/logger";
import { create } from "zustand";

/**
 * Le tassonomie in memoria, cosi' che un'etichetta non costi una query.
 *
 * Non e' persistito: la persistenza e' la tabella SQLite, e questo store ne
 * e' la copia in RAM. `hydrate()` la rilegge - all'avvio e dopo ogni pull del
 * catalogo.
 *
 * I DUE RISOLUTORI SI RICOSTRUISCONO A OGNI `hydrate`, e non e' uno spreco:
 * e' quel che rende reattivi i componenti. Un componente che seleziona
 * `muscleLabel` si ridisegna quando la funzione cambia identita', cioe'
 * quando le tassonomie sono cambiate. Se leggessero `get()` senza essere
 * ricreate, un gruppo rinominato dal pannello resterebbe scritto col nome
 * vecchio fino al riavvio.
 *
 * La lingua la leggono al momento della chiamata da `i18n.locale` e non la
 * catturano: al cambio lingua il navigatore si rimonta (vedi CLAUDE.md
 * § Lingua), quindi ogni etichetta si ricalcola comunque.
 */
export interface TaxonomyState {
  /** Tutti, cancellati compresi: per disegnare quel che c'e' gia'. */
  muscleGroups: TaxonomyRow[];
  equipment: TaxonomyRow[];
  /** Solo i vivi: per chi offre una scelta. */
  liveMuscleGroups: TaxonomyRow[];
  liveEquipment: TaxonomyRow[];
  muscleLabel: (slug: string) => string;
  equipmentLabel: (slug: string) => string;
  hydrate: () => Promise<void>;
}

const risolutore =
  (rows: TaxonomyRow[], prefisso: string) =>
  (slug: string): string =>
    taxonomyLabel(rows, slug, i18n.locale, (s) => i18n.t(`${prefisso}.${s}`));

export const useTaxonomyStore = create<TaxonomyState>()((set) => ({
  muscleGroups: [],
  equipment: [],
  liveMuscleGroups: [],
  liveEquipment: [],
  /*
   * Ricaduta su i18n per i ventitre' slug del seme, che risponde giusto.
   * NON e' per una finestra temporale prima di `hydrate`: `App.tsx` la
   * awaita dentro il gate d'avvio, prima di montare `<Navigation />`, quindi
   * nessuna schermata si disegna prima che questo stato venga sostituito.
   * Serve al percorso d'ERRORE - `hydrate` che incassa un guasto (vedi il
   * catch qui sotto) - non a un istante che nel flusso normale non esiste
   * piu'.
   */
  muscleLabel: risolutore([], "gym.muscle"),
  equipmentLabel: risolutore([], "gym.equipment"),

  hydrate: async () => {
    try {
      const muscoli = await listAllTaxonomy("muscle_groups");
      const attrezzi = await listAllTaxonomy("equipment_types");
      set({
        muscleGroups: muscoli,
        equipment: attrezzi,
        liveMuscleGroups: muscoli.filter((r) => r.deleted_at === null),
        liveEquipment: attrezzi.filter((r) => r.deleted_at === null),
        muscleLabel: risolutore(muscoli, "gym.muscle"),
        equipmentLabel: risolutore(attrezzi, "gym.equipment"),
      });
    } catch (error) {
      // Le costanti del seme sono ancora la ricaduta di i18n: la palestra si
      // disegna comunque, con le etichette dei ventitre' slug che c'erano.
      logger.warn("[catalogo] tassonomie non lette", error);
    }
  },
}));
