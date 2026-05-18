import { Link, Stack } from 'expo-router';

import { Text } from '@/components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <SafeAreaView className="flex-1 items-center justify-center p-5">
        <Text className="text-3xl">This screen does not exist.</Text>
        <Link href="/" className="mt-4 py-4">
          <Text className="text-gray-400">Go to home screen!</Text>
        </Link>
      </SafeAreaView>
    </>
  );
}
