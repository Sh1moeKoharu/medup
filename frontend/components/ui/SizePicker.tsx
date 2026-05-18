import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

interface SizePickerProps {
  sizes: string[];
  selectedSize?: string;
  onSizeChange: (size: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SizePicker({
  sizes,
  selectedSize,
  onSizeChange,
  label = 'Size',
  disabled = false,
  className = '',
}: SizePickerProps) {
  return (
    <View className={className}>
      {label && <Text className="mb-2">{label}</Text>}

      <View className="flex-row flex-wrap gap-2">
        {sizes.map((size) => {
          const isSelected = selectedSize === size;
          const isDisabled = disabled;

          return (
            <TouchableOpacity
              key={size}
              onPress={() => !isDisabled && onSizeChange(size)}
              disabled={isDisabled}
              className={clx(
                'h-10 w-10 items-center justify-center rounded-full border disabled:opacity-50',
                isSelected ? 'border-black bg-black' : 'border-gray-200 bg-white',
              )}
            >
              <Text className={clx(isSelected ? 'text-white' : '')}>{size}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default SizePicker;
