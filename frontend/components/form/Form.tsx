import { clx } from '@/utils/clx';
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { FieldValues, FormProvider, useForm, UseFormProps, UseFormReturn } from 'react-hook-form';
import { View } from 'react-native';
import * as z from 'zod/v4';

interface FormProps<T extends FieldValues, Output> {
  schema: z.ZodType<Output, T>;
  onSubmit: (
    data: Output,
    form: UseFormReturn<T, unknown, Output>,
    event?: React.BaseSyntheticEvent,
  ) => unknown | Promise<unknown>;
  defaultValues?: UseFormProps<T>['defaultValues'];
  children: React.ReactNode;
  className?: string;
}

interface CustomFormContextType {
  handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
}

const CustomFormContext = React.createContext<CustomFormContextType>({
  handleSubmit: () => Promise.reject(new Error('handleSubmit not implemented')),
});

export const useCustomFormContext = () => {
  const context = React.useContext(CustomFormContext);
  if (!context) {
    throw new Error('useCustomFormContext must be used within a FormProvider');
  }
  return context;
};

export function Form<T extends FieldValues, Output>({
  schema,
  onSubmit,
  defaultValues,
  children,
  className = '',
}: FormProps<T, Output>) {
  const methods = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    mode: 'onChange',
  });

  const handleSubmit = methods.handleSubmit((data, event) => {
    return onSubmit(data, methods, event);
  });

  return (
    <FormProvider {...methods}>
      <CustomFormContext.Provider value={{ handleSubmit }}>
        <View className={clx('gap-y-4', className)}>{children}</View>
      </CustomFormContext.Provider>
    </FormProvider>
  );
}
