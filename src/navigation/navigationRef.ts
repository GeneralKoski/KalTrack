import { createNavigationContainerRef } from "@react-navigation/native";

// Permette di navigare da fuori dall'albero React (es. da store, interceptor axios)
export const navigationRef = createNavigationContainerRef<any>();
