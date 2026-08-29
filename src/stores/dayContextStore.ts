import { create } from "zustand";

/**
 * Il giorno che l'utente sta guardando nel diario, per l'assistente.
 *
 * L'assistente e' montato sopra la navigazione e non puo' vedere lo stato
 * locale della schermata di oggi. Senza questo canale il suo contesto era
 * fisso a `todayIso()`: chi scorreva a ieri e diceva "aggiungi il pane" se lo
 * vedeva scrivere su oggi, e "togli il pane" non trovava nessun id perche' le
 * voci nel contesto erano quelle di un altro giorno.
 *
 * `null` significa "nessuna schermata sta guardando un giorno preciso": vale
 * oggi. La schermata lo azzera quando perde il fuoco, cosi' il riferimento non
 * sopravvive a se stesso mentre si e' in palestra o nel profilo.
 */
interface DayContextStore {
  referenceDate: string | null;
  setReferenceDate: (date: string | null) => void;
}

export const useDayContextStore = create<DayContextStore>()((set) => ({
  referenceDate: null,
  setReferenceDate: (referenceDate) => set({ referenceDate }),
}));
