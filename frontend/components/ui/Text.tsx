import { clx } from '@/utils/clx';
import { Text as NativeText, TextProps } from 'react-native';

export const Text: React.FC<TextProps> = ({ className, ...props }) => {
  return <NativeText className={clx('text-base', className)} {...props} />;
};
