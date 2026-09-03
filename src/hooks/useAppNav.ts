import { StackActions, useNavigation } from "@react-navigation/native";

// Rotte navigabili con i relativi parametri. Centralizza l'unico cast
// necessario con l'API statica di React Navigation (i nomi schermata si
// ripetono negli stack per-tab), mantenendo la type-safety dei parametri.
// È anche la superficie su cui si appoggerà il tool `navigate` dell'assistente.
export interface NavParams {
  TodayTab: undefined;
  ProgressTab: undefined;
  GymTab: undefined;
  ProfileTab: undefined;
  Foods: undefined;
  FoodScan: undefined;
  /**
   * `barcode` senza `id` e' il modulo vuoto con il codice appena letto dentro:
   * il prodotto non e' in libreria ne' in archivio, e chi lo ha in mano ha
   * l'etichetta davanti.
   */
  FoodForm: { id?: string; barcode?: string };
  Recipes: undefined;
  RecipeForm: { id?: string };
  Settings: undefined;
  Appearance: undefined;
  /** `focus: "aiKey"` arriva da "serve la chiave AI": il cursore parte nel campo. */
  AssistantSettings: { focus?: "aiKey" };
  Health: undefined;
  Admin: undefined;
  Targets: undefined;
  Backup: undefined;
  Diagnostics: undefined;
  MealTypes: undefined;
  Exercises: undefined;
  Routines: undefined;
  RoutineForm: { id?: string };
  Session: { routineId: string; dayIndex: number };
  Achievements: undefined;
  Fasting: undefined;
  Friends: undefined;
  FriendProfile: { handle: string };
  Comparison: undefined;
  MyProfile: undefined;
  Measurements: undefined;
  ProgressPhotos: undefined;
  MealPlan: undefined;
  ShoppingList: undefined;
  Reminders: undefined;
}

type NavigateFn = (name: string, params?: object) => void;

export function useAppNav() {
  const navigation = useNavigation();
  const navigate = navigation.navigate as unknown as NavigateFn;
  return {
    navigate: <K extends keyof NavParams>(name: K, params?: NavParams[K]) =>
      navigate(name, params),
    /**
     * Sostituisce la schermata corrente invece di impilarne un'altra.
     *
     * Passa da `StackActions` e non da `navigation.replace`: quest'ultimo
     * esiste solo sui navigatori di tipo stack, e con l'API statica il tipo
     * che arriva da `useNavigation` non lo sa. L'azione, invece, la gestisce
     * lo stack che sta sopra chiunque la spedisca.
     */
    replace: <K extends keyof NavParams>(name: K, params?: NavParams[K]) =>
      navigation.dispatch(StackActions.replace(name, params)),
    goBack: () => navigation.goBack(),
  };
}
