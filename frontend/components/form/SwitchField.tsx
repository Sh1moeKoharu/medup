import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import React from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Switch, TouchableOpacity, View } from 'react-native';

interface SwitchFieldProps {
  name: string;
  label: string;
  description?: string;
  className?: string;
  disabled?: boolean;
}

export function SwitchField({ name, label, description, className = '', disabled = false }: SwitchFieldProps) {
  const { control } = useFormContext();
  const {
    field: { onChange, value = false },
    fieldState: { error },
  } = useController({
    name,
    control,
  });

  return (
    <View className={clx('w-full', className)}>
      <TouchableOpacity
        onPress={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={clx('flex-row items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-4', {
          'opacity-50': disabled,
          'border-error-500': error,
        })}
      >
        <View className="mr-4 flex-1">
          <Text>{label}</Text>
          {description && <Text className="mt-1 text-sm text-gray-500">{description}</Text>}
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: '#E5E5E5', true: '#282828' }}
          thumbColor={value ? '#FFFFFF' : '#FFFFFF'}
        />
      </TouchableOpacity>
      {error && <Text className="mt-1 text-sm text-error-500">{error.message}</Text>}
    </View>
  );
}
