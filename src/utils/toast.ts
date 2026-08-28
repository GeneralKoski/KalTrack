import Toast from "react-native-toast-message";

interface ToastOptions {
  title?: string;
  message?: string;
}

export const showToast = {
  error: ({ title, message }: ToastOptions) => {
    Toast.show({
      type: "error",
      text1: title ?? "Errore",
      text2: message,
    });
  },

  success: ({ title, message }: ToastOptions) => {
    Toast.show({
      type: "success",
      text1: title ?? "Fatto!",
      text2: message,
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
