import { Loader } from '@/components/icons/loader';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';

export type ButtonProps = TouchableOpacityProps & {
  isPending?: boolean;
  variant?: 'solid' | 'outline';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  textClassName?: string;
};

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  isPending = false,
  disabled = false,
  variant = 'solid',
  icon,
  iconPosition = 'right',
  textClassName,
  ...props
}) => {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || isPending}
      className={clx(
        'items-center justify-center gap-x-2 rounded-xl p-4',
        iconPosition === 'left' ? 'flex-row-reverse' : 'flex-row',
        {
          'bg-black': variant === 'solid',
          'border border-gray-200 bg-transparent': variant === 'outline',
          'border-gray-100 bg-gray-100': disabled || isPending,
        },
        className,
      )}
      {...props}
    >
      <Text
        className={clx(
          'text-lg',
          {
            'text-white': variant === 'solid',
          },
          {
            'text-gray-300': disabled || isPending,
          },
          textClassName,
        )}
      >
        {children}
      </Text>
      {isPending && <Loader size={16} color="#B5B5B5" className="animate-spin" />}
      {typeof icon !== 'undefined' && !isPending ? icon : null}
    </TouchableOpacity>
  );
};
