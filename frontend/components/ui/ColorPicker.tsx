import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

interface ColorPickerProps {
  colors: { name: string; value: string }[];
  selectedColor?: string;
  onColorChange: (color: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function ColorPicker({
  colors,
  selectedColor,
  onColorChange,
  label = 'Colors',
  disabled = false,
  className = '',
}: ColorPickerProps) {
  return (
    <View className={className}>
      {label && <Text className="mb-2">{label}</Text>}

      <View className="flex-row flex-wrap gap-2">
        {colors.map((color) => {
          const isSelected = selectedColor === color.name;
          const isDisabled = disabled;

          return (
            <TouchableOpacity
              key={color.name}
              onPress={() => !isDisabled && onColorChange(color.name)}
              disabled={isDisabled}
              className={clx(
                'h-10 flex-row items-center justify-center gap-2 rounded-full border px-2 disabled:opacity-50',
                isSelected ? 'border-black bg-black' : 'border-gray-200 bg-white',
              )}
            >
              <View className="h-5 w-5 rounded-full border border-gray-200" style={{ backgroundColor: color.value }} />
              <Text className={clx({ 'text-white': isSelected })}>{color.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
