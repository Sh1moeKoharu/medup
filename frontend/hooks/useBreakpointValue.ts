import { useSafeAreaFrame } from 'react-native-safe-area-context';

type BreakpointSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const useBreakpointValue = <T>(values: { base: T } & Partial<Record<BreakpointSize, T>>) => {
  const { width } = useSafeAreaFrame();

  if (width >= 1280 && typeof values['xl'] !== 'undefined') return values['xl'];
  if (width >= 1024 && typeof values['lg'] !== 'undefined') return values['lg'];
  if (width >= 768 && typeof values['md'] !== 'undefined') return values['md'];
  if (width >= 600 && typeof values['sm'] !== 'undefined') return values['sm'];
  if (width >= 480 && typeof values['xs'] !== 'undefined') return values['xs'];
  return values['base'];
};
