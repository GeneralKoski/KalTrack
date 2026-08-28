import { useTranslation } from "@/src/hooks/useTranslation";
import { logger } from "@/src/utils/logger";
import { showToast } from "@/src/utils/toast";
import React, {
  useImperativeHandle,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { View } from "react-native";
import { DfButton } from "./DfButton";

export interface DfFormRef {
  reset: () => void;
  submit: () => void;
}

interface DfFormProps<T extends FieldValues> {
  children: ReactNode;
  ref?: Ref<DfFormRef>;
  initialValues?: DefaultValues<T>;
  /** Testo del bottone submit. Default: "Salva" */
  submitLabel?: string;
  /** Nascondi il bottone submit automatico */
  hideSubmitButton?: boolean;
  /**
   * Salvataggio. L'app è local-first: qui non si passa da nessuna API, si
   * scrive sul DB locale. Il bottone resta in loading finché la promise
   * non si risolve.
   */
  onSubmit: (values: T, form: UseFormReturn<T>) => void | Promise<void>;
  /**
   * Callback errore. Ritorna `true` se l'errore è già gestito
   * (blocca il toast generico del form).
   */
  onError?: (error: unknown) => boolean | void;
}

export function DfForm<T extends FieldValues>({
  children,
  ref,
  initialValues,
  submitLabel,
  hideSubmitButton = false,
  onSubmit,
  onError,
}: DfFormProps<T>) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedSubmitLabel = submitLabel ?? t("save");

  const form = useForm<T>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  const handleSubmit = async (formData: T) => {
    // Pulisci eventuali errori impostati a mano dal submit precedente
    form.clearErrors();
    setIsSubmitting(true);
    try {
      await onSubmit(formData, form);
    } catch (error) {
      logger.error("[DfForm] salvataggio fallito", error);
      if (!onError?.(error)) {
        showToast.error({ title: t("general_error") });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  useImperativeHandle(ref, () => ({
    reset: () => form.reset(),
    submit: () => form.handleSubmit(handleSubmit)(),
  }));

  return (
    <FormProvider {...form}>
      <View>
        {children}

        {!hideSubmitButton && (
          <DfButton
            label={resolvedSubmitLabel}
            loading={isSubmitting}
            onPress={form.handleSubmit(handleSubmit)}
          />
        )}
      </View>
    </FormProvider>
  );
}
