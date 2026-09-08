import { setAuthTokenProvider } from "@/src/api/client";
import * as social from "@/src/api/social";
import {
  clearAiEnabled,
  readAiEnabled,
  resetSyncMarkers,
  writeAiEnabled,
} from "@/src/services/syncMarkers";
import { logger } from "@/src/utils/logger";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

/**
 * L'account, che in KalTrack e' FACOLTATIVO.
 *
 * Senza, l'app e' quella di sempre: il diario, la palestra e tutto il resto
 * vivono sul telefono e non hanno bisogno di nessun server. L'account serve
 * solo agli amici, e non porta con se' il diario: al server arrivano soltanto
 * i totali di giornata che l'utente sceglie di condividere.
 *
 * Il token sta in SecureStore e non in AsyncStorage: e' una credenziale, e
 * AsyncStorage e' leggibile su un dispositivo compromesso.
 */
const TOKEN_KEY = "kaltrack_account_token";

interface AccountStore {
  token: string | null;
  profile: social.MyProfile | null;
  /**
   * L'ULTIMO VALORE NOTO di `users.ai_enabled`, non la verita' del momento:
   * vedi `aiAvailable()` in `domain/aiAccess.ts` per il perche'.
   */
  aiEnabled: boolean | null;
  isHydrated: boolean;
  restore: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: social.MyProfile) => void;
}

export const useAccountStore = create<AccountStore>()((set, get) => ({
  token: null,
  profile: null,
  aiEnabled: null,
  isHydrated: false,

  restore: async () => {
    try {
      // Letto a prescindere dal token: senza account `aiAvailable()` torna
      // comunque spenta, e leggerlo comunque evita di dover distinguere due
      // percorsi per un valore che non danneggia nessuno stando in memoria.
      //
      // DENTRO il try, e non prima: `readAiEnabled` non lancia mai (e' testato
      // apposta), ma se un giorno lo facesse - o smettesse di esserlo per un
      // refactor distratto - la reject uscirebbe da `restore()` prima di
      // arrivare a `isHydrated: true`. `App.tsx` gia' prevede un database non
      // sano e sblocca comunque l'avvio; un `restore()` che non atterra mai
      // lascerebbe `isHydrated` falso per sempre, e con lui l'intera catena
      // di avvio (`runSync`, `syncSharedStats`, il catalogo) non partirebbe
      // mai - un avvio impantanato per un settaggio che non si e' letto.
      const aiEnabled = await readAiEnabled();
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      set({ token, aiEnabled, isHydrated: true });
      if (token) void get().refreshProfile();
    } catch (error) {
      logger.error("[account] lettura del token fallita", error);
      set({ isHydrated: true });
    }
  },

  signIn: async (token) => {
    /*
     * Prima di tutto il resto: i segnaposto della sincronizzazione valgono per
     * UN account.
     *
     * Il cursore e' la posizione dentro il contatore del server per quel
     * l'utente. Entrando con un altro account e tenendolo, il telefono
     * chiederebbe "le righe dopo la 406" a un contatore che riparte da uno, e
     * la risposta e' vuota: i dati del nuovo account non arriverebbero mai, e
     * senza nessun errore a dirlo.
     *
     * Va fatto qui e non nell'uscita: un token revocato dal server fa cadere
     * la sessione senza passare da signOut, e il prossimo accesso si
     * ritroverebbe i segnaposto vecchi. Dall'accesso invece non si scappa.
     */
    await resetSyncMarkers();
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token });
    await get().refreshProfile();
  },

  signOut: async () => {
    // Si prova a revocare il token sul server, ma l'uscita avviene comunque:
    // restare collegati perche' la rete non c'e' sarebbe la cosa peggiore.
    try {
      if (get().token) await social.logout();
    } catch (error) {
      logger.warn("[account] revoca del token non riuscita", error);
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    /*
     * Il valore noto appartiene all'account che sta uscendo, non al
     * prossimo. Lasciarlo in piedi (stato E segnaposto) e' innocuo finche'
     * non c'e' nessun token - `aiAvailable` lo ignora comunque - ma non copre
     * la finestra subito dopo: un secondo utente che accede e il cui
     * `/api/me` fallisce (rete caduta appena dopo il login) si ritroverebbe
     * giudicato sul diritto di chi era uscito prima. Azzerarlo qui riporta
     * quel caso a `null`, cioe' in favore dell'utente - la stessa regola che
     * il task esiste per applicare.
     */
    await clearAiEnabled();
    set({ token: null, profile: null, aiEnabled: null });
  },

  refreshProfile: async () => {
    try {
      const profile = await social.fetchMyProfile();
      // Il profilo si tiene SUBITO: e' il dato vero, appena arrivato. Il
      // segnaposto e' solo la sua cache per l'avvio offline, e un suo guasto
      // non deve buttare via un profilo che e' arrivato davvero - ne'
      // scrivere "profilo non letto" quando invece lo e' stato.
      set({ profile, aiEnabled: profile.aiEnabled });
      try {
        // Si riscrive a ogni `/api/me` riuscito: e' l'unico momento in cui
        // questo telefono sa davvero cosa dice il server.
        await writeAiEnabled(profile.aiEnabled);
      } catch (error) {
        logger.warn("[account] segnaposto del diritto AI non scritto", error);
      }
    } catch (error) {
      logger.warn("[account] profilo non letto", error);
      // Un token rifiutato non e' un errore di rete: e' una sessione finita.
      if (
        error instanceof Error &&
        "isUnauthenticated" in error &&
        (error as { isUnauthenticated: boolean }).isUnauthenticated
      ) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        set({ token: null, profile: null });
      }
    }
  },

  setProfile: (profile) => {
    // Anche qui arriva un profilo fresco (risposta di `updateMyProfile`, o
    // l'aggiornamento ottimistico di `ShareSettings` che riusa quello gia' in
    // stato): lo stesso segnaposto, altrimenti divergerebbe da quel che
    // `refreshProfile` scrive. Il `.catch()` evita una promise rejection non
    // gestita se il database rifiuta la scrittura: non c'e' niente da fare
    // di piu' qui, la prossima `/api/me` riuscita la riscrive.
    writeAiEnabled(profile.aiEnabled).catch((error) => {
      logger.warn("[account] segnaposto del diritto AI non scritto", error);
    });
    set({ profile, aiEnabled: profile.aiEnabled });
  },
}));

// Il client legge il token da qui: cosi' non conosce lo store e lo store non
// conosce axios.
setAuthTokenProvider(() => useAccountStore.getState().token);
