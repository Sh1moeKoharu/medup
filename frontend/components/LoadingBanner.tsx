import { Loader } from '@/components/icons/loader';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import { View } from 'react-native';
import { color } from '@/theme/tokens';

type LoadingBannerProps = {
  variant?: 'ghost' | 'outline';
  className?: string;
  children?: React.ReactNode;
};

export const LoadingBanner = ({ variant = 'outline', className, children }: LoadingBannerProps) => {
  const wrapperClasses = clx(
    'items-center gap-2',
    {
      'bg-white border border-gray-200 p-4 flex-row rounded-xl justify-between': variant === 'outline',
      'flex-col-reverse': variant === 'ghost',
    },
    className,
  );

  const textClasses = clx('text-gray-300', {
    'text-center': variant === 'ghost',
  });

  return (
    <View className={wrapperClasses}>
      <View className="flex-1">
        <Text className={textClasses}>{children}</Text>
      </View>
      <Loader size={16} color={color.textoTerciario} className="animate-spin" />
    </View>
  );
};
