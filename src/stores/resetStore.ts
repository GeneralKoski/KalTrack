import { useTranslationStore } from "@/src/stores/translationStore";

export const resetAllStores = async () => {
  useTranslationStore.getState().reset();
};
