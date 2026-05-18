import { ToastMessage } from '@/components/ToastMessage';
import { ToastConfig, ToastData } from 'react-native-toast-message';

export const toastConfig = {
  success: ({ text1, text2 }: ToastData) => (
    <ToastMessage heading={text1} text={text2} variant="outline" colorScheme="success" />
  ),
  error: ({ text1, text2 }: ToastData) => (
    <ToastMessage heading={text1} text={text2} variant="outline" colorScheme="error" />
  ),
  info: ({ text1, text2 }: ToastData) => (
    <ToastMessage heading={text1} text={text2} variant="outline" colorScheme="warning" />
  ),
} satisfies ToastConfig;
