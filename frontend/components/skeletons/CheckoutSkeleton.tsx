import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { View } from 'react-native';

export const CheckoutSkeleton = () => (
  <Layout>
    <Text className="mb-6 text-4xl">Checkout</Text>

    {/* Order Items */}
    <View className="flex-1 overflow-hidden">
      <Text className="text-2xl">Cart Items</Text>
      {[1, 2].map((index) => (
        <View key={index} className="flex-row gap-4 bg-white py-6">
          <View className="h-[5.25rem] w-[5.25rem] rounded-xl bg-gray-200" />
          <View className="flex-1 flex-col gap-2">
            <View className="h-5 w-3/4 rounded-md bg-gray-200" />
            <View className="h-4 w-1/2 rounded-md bg-gray-200" />
          </View>
          <View className="ml-auto h-5 w-16 rounded-md bg-gray-200" />
        </View>
      ))}
      <View className="mt-4">
        <Text className="mb-6 text-2xl">Information</Text>

        <View className="mb-4 flex-row">
          <Text className="w-24 text-gray-300">Full Name</Text>
          <View className="h-5 w-1/3 rounded-md bg-gray-200" />
        </View>
        <View className="mb-4 flex-row">
          <Text className="w-24 text-gray-300">Mail</Text>
          <View className="h-5 w-1/3 rounded-md bg-gray-200" />
        </View>
        <View className="mb-4 flex-row">
          <Text className="w-24 text-gray-300">Address</Text>
          <View className="h-5 w-1/2 rounded-md bg-gray-200" />
        </View>
        <View className="mb-10 flex-row">
          <Text className="w-24 text-gray-300">Phone</Text>
          <View className="h-5 w-1/3 rounded-md bg-gray-200" />
        </View>
      </View>
    </View>

    <View className="mt-6">
      {/* Order Summary */}
      <View className="mb-4 h-6 w-32 rounded-md bg-gray-200" />

      <View className="mb-2 flex-row justify-between">
        <View className="h-4 w-16 rounded-md bg-gray-200" />
        <View className="h-4 w-20 rounded-md bg-gray-200" />
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

      {/* Action Buttons */}
      <View className="flex-row gap-2">
        <View className="h-12 flex-1 rounded-md bg-gray-200" />
        <View className="h-12 flex-1 rounded-md bg-gray-200" />
      </View>
    </View>
  </Layout>
);
