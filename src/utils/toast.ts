// i18n e non t(): il toast si chiama anche da fuori un componente React.
import { i18n } from "@/src/i18n";
import Toast from "react-native-toast-message";

interface ToastOptions {
  title?: string;
  message?: string;
}

export const showToast = {
  error: ({ title, message }: ToastOptions) => {
    Toast.show({
      type: "error",
      text1: title ?? i18n.t("error"),
      text2: message,
    });
  },

  success: ({ title, message }: ToastOptions) => {
    Toast.show({
      type: "success",
      text1: title ?? i18n.t("done"),
      text2: message,
    });
  },

  /** Un'azione già fatta che si può disfare: il toast porta il bottone. */
  undo: ({ title, onUndo }: { title: string; onUndo: () => void }) => {
    Toast.show({
      type: "undo",
      text1: title,
      visibilityTime: 5000,
      props: { onUndo },
    });
  },

  info: ({ title, message }: ToastOptions) => {
    Toast.show({
      type: "info",
      text1: title,
      text2: message,
    });
  },
};
