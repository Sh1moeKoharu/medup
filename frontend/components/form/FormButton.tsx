import { Button, ButtonProps } from '@/components/ui/Button';
import React from 'react';
import { useFormContext } from 'react-hook-form';
import { useCustomFormContext } from './Form';

export function FormButton({ children = 'Submit', disabled = false, isPending = false, ...props }: ButtonProps) {
  const { formState } = useFormContext();
  const { handleSubmit } = useCustomFormContext();

  const isDisabled = disabled || isPending || !formState.isValid;

  return (
    <Button {...props} onPress={handleSubmit} disabled={isDisabled}>
      {children}
    </Button>
  );
}
