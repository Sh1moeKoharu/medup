import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { View } from 'react-native';
import { SafeAreaViewProps } from 'react-native-safe-area-context';

export const CartSkeleton: React.FC<SafeAreaViewProps> = ({ ...props }) => (
  <Layout {...props}>
    <Text className="mb-6 text-4xl">Cart</Text>
    <View className="flex-row items-center justify-between border-b border-gray-200 pb-6">
      <View>
        <View className="mb-2 h-6 w-32 rounded-md bg-gray-200" />
        <View className="h-4 w-48 rounded-md bg-gray-200" />
      </View>
      <View className="h-8 w-8 rounded-md bg-gray-200" />
    </View>
    {[1, 2].map((index) => (
      <View key={index} className="flex-row gap-4 border-b border-gray-200 bg-white py-6">
        <View className="h-[5.25rem] w-[5.25rem] rounded-xl bg-gray-200" />
        <View className="flex-1 flex-col gap-2">
          <View className="h-5 w-3/4 rounded-md bg-gray-200" />
          <View className="h-4 w-1/2 rounded-md bg-gray-200" />
          <View className="h-8 w-20 rounded-md bg-gray-200" />
        </View>
        <View className="ml-auto h-5 w-16 rounded-md bg-gray-200" />
      </View>
    ))}
    <View className="mb-20 mt-6">
      <View className="mb-6 flex-row items-start gap-2">
        <View className="h-[3.125rem] w-[60%] rounded-md bg-gray-200" />
        <View className="h-[3.125rem] flex-1 rounded-md bg-gray-200" />
      </View>
      <View className="mb-2 flex-row justify-between">
        <View className="h-4 w-16 rounded-md bg-gray-200" />
        <View className="h-4 w-20 rounded-md bg-gray-200" />
      </View>
      <View className="flex-row justify-between">
        <View className="h-4 w-20 rounded-md bg-gray-200" />
        <View className="h-4 w-24 rounded-md bg-gray-200" />
      </View>
      <View className="my-4 h-hairline bg-gray-200" />
      <View className="mb-6 flex-row justify-between">
        <View className="h-7 w-16 rounded-md bg-gray-200" />
        <View className="h-7 w-24 rounded-md bg-gray-200" />
      </View>
      <View className="flex-row gap-2">
        <View className="h-12 flex-1 rounded-md bg-gray-200" />
        <View className="h-12 flex-1 rounded-md bg-gray-200" />
      </View>
    </View>
  </Layout>
);
