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

/**
 * Una voce del catalogo comune.
 *
 * Non dice chi l'ha aggiunta: `mine` dice soltanto se sei tu, cioe' se la puoi
 * correggere. Chi l'ha scritta, quando non sei tu, non esce da nessuna parte.
 */
export interface CatalogExercise {
  id: number;
  name: string;
  nameNorm: string;
  muscleGroup: string;
  /** Elenco separato da virgole, come `equipment`. */
  secondaryMuscles: string | null;
  equipment: string | null;
  mine: boolean;
}

/**
 * Una pagina di catalogo.
 *
 * `next` e' il nome normalizzato da cui riprendere, null quando non c'e'
 * altro: il catalogo cresce con gli iscritti e non esiste un numero di voci
 * che basti per sempre.
 */
export interface CatalogPage<T> {
  data: T[];
  next: string | null;
}

/** Un alimento del catalogo comune, con i valori per 100 g / 100 ml. */
export interface CatalogFood {
  id: number;
  name: string;
  nameNorm: string;
  brand: string | null;
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
  servingLabel: string | null;
  mine: boolean;
}

export interface CatalogFoodInput {
  name: string;
  brand?: string | null;
  kcal: number;
  protein?: number;
  carbs?: number;
  sugars?: number;
  fat?: number;
  saturatedFat?: number;
  fiber?: number;
  salt?: number;
  isLiquid?: boolean;
  defaultServingG?: number | null;
  servingLabel?: string | null;
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

/**
 * Il catalogo comune degli esercizi.
 *
 * E' l'unica cosa dell'app che esce verso chi non e' amico: quel che si
 * aggiunge qui lo vedono tutti gli iscritti.
 */
export const searchCatalogExercises = (term: string, after?: string) =>
  apiRequest<CatalogPage<CatalogExercise>>({
    method: "get",
    path: "/exercises",
    params: { q: term, ...(after ? { after } : {}) },
  });

export interface CatalogExerciseInput {
  name: string;
  muscleGroup: string;
  secondaryMuscles?: string | null;
  equipment?: string | null;
}

export const addCatalogExercise = (input: CatalogExerciseInput) =>
  apiRequest<{ data: CatalogExercise }>({
    method: "post",
    path: "/exercises",
    body: input,
  }).then((r) => r.data);

/**
 * Corregge o toglie una voce del catalogo. **Solo le proprie**: il server
 * risponde 403 sulle altrui, e l'app non deve nemmeno offrirlo (`mine`).
 */
export const updateCatalogExercise = (
  id: number,
  input: CatalogExerciseInput,
) =>
  apiRequest<{ data: CatalogExercise }>({
    method: "patch",
    path: `/exercises/${id}`,
    body: input,
  }).then((r) => r.data);

export const deleteCatalogExercise = (id: number) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/exercises/${id}`,
  });

/** Il catalogo degli alimenti: stesse regole di quello degli esercizi. */
export const searchCatalogFoods = (term: string, after?: string) =>
  apiRequest<CatalogPage<CatalogFood>>({
    method: "get",
    path: "/foods",
    params: { q: term, ...(after ? { after } : {}) },
  });

export const addCatalogFood = (input: CatalogFoodInput) =>
  apiRequest<{ data: CatalogFood }>({
    method: "post",
    path: "/foods",
    body: input,
  }).then((r) => r.data);

export const updateCatalogFood = (id: number, input: CatalogFoodInput) =>
  apiRequest<{ data: CatalogFood }>({
    method: "patch",
    path: `/foods/${id}`,
    body: input,
  }).then((r) => r.data);

export const deleteCatalogFood = (id: number) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/foods/${id}`,
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
