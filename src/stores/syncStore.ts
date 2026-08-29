import { create } from "zustand";

/**
 * Il segnale che la sincronizzazione ha portato dati nuovi.
 *
 * Serve a far ridisegnare le schermate aperte. Senza, chi entra su un telefono
 * nuovo vede "0 ml" mentre il database ha gia' i suoi 700: i dati arrivano
 * dopo che la schermata li ha letti, e finche' non si naviga via e si torna
 * nessuno rilegge.
 *
 * Un contatore e non un booleano: due sincronizzazioni di fila devono
 * ricaricare due volte, e con un flag la seconda non cambierebbe stato.
 */
interface SyncStore {
  /** Cresce di uno ogni volta che la sincronizzazione scrive qualcosa. */
  revision: number;
  bumpRevision: () => void;
}

export const useSyncStore = create<SyncStore>()((set) => ({
  revision: 0,
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
