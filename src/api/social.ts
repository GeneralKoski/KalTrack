import { apiRequest } from "@/src/api/client";

/**
 * Le chiamate della sezione amici, una funzione per endpoint.
 *
 * I tipi sono scritti a mano e non generati: sono nove campi in tutto, e
 * vederli qui accanto al percorso dice a colpo d'occhio cosa arriva davvero
 * dal server.
 */

export interface AccountShares {
  calories: boolean;
  steps: boolean;
  weight: boolean;
  /** Il CONTEGGIO degli allenamenti. Non e' cosa si e' fatto: quello e' `gym`. */
  workouts: boolean;
  /**
   * La palestra: quali esercizi, con quanti carichi.
   *
   * E' l'unica condivisione che fa uscire contenuto e non un totale, e per
   * questo e' un interruttore a se' invece di essere compresa in `workouts`.
   */
  gym: boolean;
}

/** Un esercizio condiviso, gia' aggregato per giorno. */
export interface SharedExercise {
  name: string;
  sets: number;
  totalReps: number;
  volumeKg: number;
  topWeightKg: number | null;
}

/** Un giorno di palestra da pubblicare. Lista vuota = giorno di riposo. */
export interface SharedWorkoutDay {
  date: string;
  exercises: SharedExercise[];
}

/** Una persona nel confronto, come la vede chi guarda. */
export interface ComparisonParticipant {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isFriend: boolean;
  shares: {
    calories: boolean;
    steps: boolean;
    workouts: boolean;
    gym: boolean;
  };
  totals: {
    kcal: number | null;
    steps: number | null;
    workouts: number | null;
  };
  exercises: SharedExercise[];
}

export interface MyProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  email: string;
  /** Puo' rimettere a posto la password degli altri. Spento per tutti. */
  isAdmin: boolean;
  shares: AccountShares;
}

export interface AdminUser {
  id: number;
  handle: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
}

export interface FoundUser {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isFriend: boolean;
}

/** Un giorno condiviso. Null significa "non condiviso", non zero. */
export interface SharedDay {
  date: string;
  kcal: number | null;
  steps: number | null;
  weightKg: number | null;
  workouts: number | null;
}

/** Un giorno di palestra come arriva dal profilo di un altro. */
export interface SharedGymDay {
  date: string;
  exercises: SharedExercise[];
}

export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  isFriend: boolean;
  stats: SharedDay[];
  /** Vuoto se non la condivide o se non siete amici. */
  gym: SharedGymDay[];
  /**
   * Le condivisioni come le vede CHI GUARDA: a un non amico risultano tutte
   * spente. Non e' `AccountShares`, che e' il proprio profilo e porta anche la
   * finestra: quella e' un'impostazione, e le impostazioni di un altro non
   * sono affari di chi guarda.
   */
  shares: {
    calories: boolean;
    steps: boolean;
    weight: boolean;
    workouts: boolean;
    gym: boolean;
  };
}

export type FriendshipStatus = "pending" | "accepted";

export interface Friendship {
  id: number;
  status: FriendshipStatus;
  /** Chi ha chiesto: "outgoing" siamo noi, "incoming" e' l'altro. */
  direction: "outgoing" | "incoming";
  user: { handle: string; displayName: string; avatarUrl: string | null } | null;
}

export const register = (input: {
  email: string;
  password: string;
  handle: string;
  displayName: string;
}) =>
  apiRequest<{ token: string; handle: string }>({
    method: "post",
    path: "/register",
    body: input,
  });

/** `login` e non `email`: si entra con l'una o con il nome utente. */
export const login = (input: { login: string; password: string }) =>
  apiRequest<{ token: string; handle: string }>({
    method: "post",
    path: "/login",
    body: input,
  });

export const logout = () =>
  apiRequest<{ ok: boolean }>({ method: "post", path: "/logout" });

export const fetchMyProfile = () =>
  apiRequest<MyProfile>({ method: "get", path: "/me" });

export const updateMyProfile = (input: Partial<{
  handle: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  shareCalories: boolean;
  shareSteps: boolean;
  shareWeight: boolean;
  shareWorkouts: boolean;
  shareGym: boolean;
}>) => apiRequest<MyProfile>({ method: "patch", path: "/me", body: input });

export const searchUsers = (term: string) =>
  apiRequest<{ data: FoundUser[] }>({
    method: "get",
    path: "/users",
    params: { q: term },
  }).then((r) => r.data);

export const fetchProfile = (handle: string) =>
  apiRequest<{ data: PublicProfile }>({
    method: "get",
    path: `/users/${encodeURIComponent(handle)}`,
  }).then((r) => r.data);

export const listFriendships = () =>
  apiRequest<{ data: Friendship[] }>({
    method: "get",
    path: "/friendships",
  }).then((r) => r.data);

export const requestFriendship = (handle: string) =>
  apiRequest<Friendship>({
    method: "post",
    path: "/friendships",
    body: { handle },
  });

export const acceptFriendship = (id: number) =>
  apiRequest<Friendship>({
    method: "patch",
    path: `/friendships/${id}/accept`,
  });

/** Rifiuta una richiesta o toglie un'amicizia: per il server e' lo stesso. */
export const removeFriendship = (id: number) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/friendships/${id}`,
  });

export const syncSharedStats = (days: SharedDay[]) =>
  apiRequest<{ synced: number }>({
    method: "put",
    path: "/me/stats",
    body: { days },
  });

/**
 * Pubblica la palestra.
 *
 * Il server rifiuta con 403 se l'interruttore e' spento: l'app non chiama
 * nemmeno, ma le due difese servono entrambe.
 */
export const syncSharedWorkouts = (days: SharedWorkoutDay[]) =>
  apiRequest<{ synced: number }>({
    method: "put",
    path: "/me/workouts",
    body: { days },
  });

/**
 * I numeri di piu' persone per lo stesso giorno, in una chiamata sola.
 *
 * Non torna i propri: quelli il telefono li ha gia', ed e' lui la fonte di
 * verita'.
 */
export const fetchComparison = (
  handles: string[],
  date?: string,
  days?: number,
) =>
  apiRequest<{
    date: string;
    days: number;
    participants: ComparisonParticipant[];
  }>({
    method: "get",
    path: "/comparison",
    params: {
      handles: handles.join(","),
      ...(date ? { date } : {}),
      ...(days ? { days: String(days) } : {}),
    },
  });

/** L'elenco degli utenti, per l'amministratore. Il server rifiuta gli altri. */
export const fetchAllUsers = () =>
  apiRequest<{ users: AdminUser[] }>({ method: "get", path: "/admin/users" });

export const resetUserPassword = (id: number, password: string) =>
  apiRequest<{ handle: string }>({
    method: "post",
    path: `/admin/users/${id}/password`,
    body: { password },
  });
