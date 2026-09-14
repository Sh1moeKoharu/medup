import { Check } from '@/components/icons/check';
import { CircleAlert } from '@/components/icons/circle-alert';
import { TriangleAlert } from '@/components/icons/triangle-alert';
import { AlertCircle } from '@/components/icons/alert-circle';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import { clx } from '@/utils/clx';
import { View } from 'react-native';

export type InfoBannerProps = {
  /**
   * The variant of the banner, either 'ghost' or 'solid'.
   * 'ghost' variant will have a more subtle appearance.
   * 'solid' variant will have a more pronounced background color.
   *
   * @default 'solid'
   */
  variant?: 'ghost' | 'solid' | 'outline';
  /**
   * The color scheme of the banner, which determines the background and text colors.
   * Options are 'error', 'warning', and 'success'.
   *
   * @default 'warning'
   */
  colorScheme?: 'error' | 'warning' | 'success' | 'info';
  /**
   * Additional class names for the text inside the banner.
   * This can be used to apply custom styles to the text.
   */
  textClassName?: string;
  /**
   * Additional class names for the banner wrapper.
   * This can be used to apply custom styles to the banner container.
   */
  className?: string;
  /**
   * The content to be displayed inside the banner.
   */
  children?: React.ReactNode;
};

export const getInfoBannerWrapperClasses = (
  variant: 'ghost' | 'solid' | 'outline',
  colorScheme: 'error' | 'warning' | 'success' | 'info',
  className?: string,
): string => {
  return clx(
    'items-center flex-row',
    {
      'bg-error-200': colorScheme === 'error' && variant === 'solid',
      'bg-warning-200': colorScheme === 'warning' && variant === 'solid',
      'bg-success-200': colorScheme === 'success' && variant === 'solid',
      'bg-info-200': colorScheme === 'info' && variant === 'solid',
      'border-error-200': colorScheme === 'error' && variant === 'outline',
      'border-warning-200': colorScheme === 'warning' && variant === 'outline',
      'border-success-200': colorScheme === 'success' && variant === 'outline',
      'border-info-200': colorScheme === 'info' && variant === 'outline',
      'p-4 rounded-xl justify-between gap-2': variant === 'solid' || variant === 'outline',
      'gap-2 flex-row-reverse': variant === 'ghost',
      'border bg-white': variant === 'outline',
    },
    className,
  );
};

export const getInfoBannerTextClasses = (
  colorScheme: 'error' | 'warning' | 'success' | 'info',
  textClassName?: string,
): string => {
  return clx(
    {
      'text-error-500': colorScheme === 'error',
      'text-warning-500': colorScheme === 'warning',
      'text-success-500': colorScheme === 'success',
      'text-info-500': colorScheme === 'info',
    },
    textClassName,
  );
};

/**
 * El icono va con `color=` y no con clase porque es una propiedad del SVG. Los
 * valores salen de `theme/tokens`: antes estaban escritos a mano aquí y había
 * que acordarse de cambiarlos a la vez que la paleta.
 */
export const getInfoBannerIcon = (colorScheme: 'error' | 'warning' | 'success' | 'info'): React.ReactNode => {
  return {
    error: <CircleAlert size={16} color={color.iconoError} />,
    warning: <TriangleAlert size={16} color={color.iconoAviso} />,
    success: <Check size={16} color={color.iconoExito} />,
    info: <AlertCircle size={16} color={color.iconoInfo} />,
  }[colorScheme];
};

export const InfoBanner = ({
  variant = 'solid',
  colorScheme = 'warning',
  textClassName,
  className,
  children,
}: InfoBannerProps) => {
  const wrapperClasses = getInfoBannerWrapperClasses(variant, colorScheme, className);

  const textClasses = getInfoBannerTextClasses(colorScheme, textClassName);

  const icon = getInfoBannerIcon(colorScheme);

  return (
    <View className={wrapperClasses}>
      <View className="flex-1">
        <Text className={textClasses}>{children}</Text>
      </View>
      {icon}
    </View>
  );
};
