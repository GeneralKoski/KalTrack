import { apiRequest } from "@/src/api/client";

/**
 * Il catalogo comune, in pull incrementale.
 *
 * Sostituisce le letture `/exercises` e `/foods` di `social.ts`, che mandavano
 * tutto il catalogo a ogni giro e lasciavano al telefono il compito di
 * inserire quel che gli mancava. La differenza non e' il traffico: quella non
 * poteva aggiornare una riga che il telefono aveva gia', quindi una
 * descrizione corretta dal pannello non arrivava a nessuno.
 *
 * Le rotte vecchie sul server restano vive per i telefoni che non si sono
 * ancora aggiornati. Qui non si chiamano piu'.
 */

/**
 * Dove eravamo arrivati.
 *
 * E' una COPPIA e non un istante, e non e' un raffinamento: Laravel scrive i
 * timestamp al secondo, e `catalog:seed` inserisce duecento righe nello
 * stesso secondo. Con il solo istante, la seconda pagina salterebbe
 * centonovantanove righe (con `>`) o le rimanderebbe per sempre (con `>=`).
 */
export interface CatalogCursor {
  since: string;
  afterId: number;
}

/**
 * Una pagina, con due segnaposti che rispondono a due domande.
 *
 * `cursor` e' DOVE SIAMO ARRIVATI, e c'e' sempre tranne che su una pagina
 * vuota: e' quello che si salva. `next` e' SE C'E' ALTRO DA CHIEDERE, e
 * diventa null appena la pagina non e' piena: e' quello che decide se il
 * ciclo continua. Confonderli era il difetto chiuso nel task 4 - salvando
 * `next`, l'ultima pagina non avanzava il segnaposto e la coda del catalogo
 * si riscaricava a ogni giro.
 */
export interface CatalogPage<T> {
  data: T[];
  cursor: CatalogCursor | null;
  next: CatalogCursor | null;
}

/**
 * Una voce di catalogo.
 *
 * `deletedAt` valorizzato vuol dire che di questa voce arriva SOLO l'identita'
 * e la data: il server non manda il contenuto di una voce cancellata, perche'
 * mandarlo sarebbe un invito a riscriverla. Per questo tutto il resto e'
 * facoltativo nel tipo - la forma del payload lo e' davvero, e fingere che non
 * lo sia sposterebbe il controllo a runtime dove il compilatore non lo vede.
 */
export interface CatalogExercise {
  uid: string;
  deletedAt: string | null;
  name?: string;
  nameNorm?: string;
  muscleGroup?: string;
  /** Elenco separato da virgole, come in colonna sul server. */
  secondaryMuscles?: string | null;
  equipment?: string | null;
  instructions?: string | null;
  /** Il NOME del file, non un percorso: i byte si chiedono a parte. */
  photo?: string | null;
  mine?: boolean;
}

export interface CatalogFood {
  uid: string;
  deletedAt: string | null;
  name?: string;
  nameNorm?: string;
  brand?: string | null;
  barcode?: string | null;
  offId?: string | null;
  kcal?: number;
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
  image?: string | null;
  mine?: boolean;
}

/** Un gruppo muscolare o un attrezzo, come li conosce il server. */
export interface TaxonomyEntry {
  slug: string;
  labelIt: string;
  labelEn: string;
  sort: number;
  deletedAt: string | null;
}

export interface Taxonomies {
  muscleGroups: TaxonomyEntry[];
  equipment: TaxonomyEntry[];
}

const pageParams = (cursor?: CatalogCursor): Record<string, string> =>
  cursor
    ? { since: cursor.since, afterId: String(cursor.afterId) }
    : {};

export const fetchCatalogExercises = (cursor?: CatalogCursor) =>
  apiRequest<CatalogPage<CatalogExercise>>({
    method: "get",
    path: "/catalog/exercises",
    params: pageParams(cursor),
  });

export const fetchCatalogFoods = (cursor?: CatalogCursor) =>
  apiRequest<CatalogPage<CatalogFood>>({
    method: "get",
    path: "/catalog/foods",
    params: pageParams(cursor),
  });

/**
 * Le tassonomie escono intere a ogni chiamata, cancellate comprese.
 *
 * Ventitre' righe in tutto: un cursore su ventitre' righe e' complessita' che
 * non compra niente. Le cancellate escono con la loro data invece di sparire,
 * perche' sul telefono ci sono esercizi che nominano quello slug in colonna.
 */
export const fetchTaxonomies = () =>
  apiRequest<Taxonomies>({ method: "get", path: "/catalog/taxonomies" });

export interface ExerciseSubmission {
  name: string;
  muscleGroup: string;
  secondaryMuscles?: string | null;
  equipment?: string | null;
}

export interface FoodSubmission {
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

/**
 * Propone una voce al catalogo.
 *
 * Torna l'uid da salvare in colonna, o **null**. Il server risponde `{ ok:
 * true }` senza `data` in tre casi, e nessuno dei tre e' un errore:
 *
 * - il nome combacia con una voce che qualcuno ha tolto dal catalogo;
 * - combacia con una voce **pubblicata**;
 * - combacia con la proposta **di un altro utente**.
 *
 * Gli ultimi due non c'erano, e la loro assenza era un difetto lato server
 * (F2 della review finale): `firstOrCreate` cerca su `name_norm` e basta, e la
 * risposta portava l'uid di una riga che non e' di chi chiede. Scritto in
 * `catalog_uid` di una riga propria, quell'uid ne assorbiva l'identita': ogni
 * correzione successiva si prendeva un 403, e il pull non inseriva mai piu' la
 * voce di catalogo vera. `null` vuol dire "non c'e' un uid perche' non c'e'
 * una **mia** proposta da agganciare".
 */
export const submitExercise = (input: ExerciseSubmission) =>
  apiRequest<{ data?: { uid: string } }>({
    method: "post",
    path: "/catalog/exercises",
    body: input,
  }).then((r) => (r.data ? { uid: r.data.uid } : null));

/**
 * Corregge la propria proposta, per uid.
 *
 * Il server accetta solo le proprie e solo finche' sono in attesa: da
 * pubblicata in poi la voce e' nell'app di tutti, e correggerla la
 * cambierebbe a chiunque. La copia dell'autore resta sul telefono.
 */
export const amendExercise = (uid: string, input: ExerciseSubmission) =>
  apiRequest<{ data: { uid: string } }>({
    method: "patch",
    path: `/catalog/exercises/${encodeURIComponent(uid)}`,
    body: input,
  }).then(() => undefined);

export const withdrawExercise = (uid: string) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/catalog/exercises/${encodeURIComponent(uid)}`,
  }).then(() => undefined);

export const submitFood = (input: FoodSubmission) =>
  apiRequest<{ data?: { uid: string } }>({
    method: "post",
    path: "/catalog/foods",
    body: input,
  }).then((r) => (r.data ? { uid: r.data.uid } : null));

export const amendFood = (uid: string, input: FoodSubmission) =>
  apiRequest<{ data: { uid: string } }>({
    method: "patch",
    path: `/catalog/foods/${encodeURIComponent(uid)}`,
    body: input,
  }).then(() => undefined);

export const withdrawFood = (uid: string) =>
  apiRequest<{ ok: boolean }>({
    method: "delete",
    path: `/catalog/foods/${encodeURIComponent(uid)}`,
  }).then(() => undefined);
