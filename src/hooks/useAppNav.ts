import { useNavigation } from "@react-navigation/native";

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
  FoodForm: { id?: string };
  Recipes: undefined;
  RecipeForm: { id?: string };
  Settings: undefined;
  Targets: undefined;
  Backup: undefined;
  Exercises: undefined;
  Routines: undefined;
  RoutineForm: { id?: string };
  Session: { routineId: string; dayIndex: number };
  Achievements: undefined;
  Fasting: undefined;
  Friends: undefined;
  FriendProfile: { handle: string };
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
    goBack: () => navigation.goBack(),
  };
}
