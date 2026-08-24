import { SalesChannelCreateForm } from '@/components/SalesChannelCreateForm';
import { Button } from '@/components/ui/Button';
import { LayoutWithKeyboardAvoidingScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useUpdateSettings } from '@/contexts/settings';
import { router } from 'expo-router';

export default function CreateSalesChannelScreen() {
  const updateSettings = useUpdateSettings();

  return (
    <LayoutWithKeyboardAvoidingScroll>
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Crear un canal de venta</Text>
      <Text className="mb-6 text-gray-300">Completa los datos para crear un canal de venta.</Text>

      <SalesChannelCreateForm
        onSalesChannelCreated={(salesChannel) => {
          updateSettings.mutate(
            {
              sales_channel_id: salesChannel.id,
            },
            {
              onSuccess: async () => {
                router.dismissTo('/settings');
              },
            },
          );
        }}
      />

      <Button variant="outline" className="mt-4" onPress={() => router.back()}>
        Cancelar
      </Button>
    </LayoutWithKeyboardAvoidingScroll>
  );
}
