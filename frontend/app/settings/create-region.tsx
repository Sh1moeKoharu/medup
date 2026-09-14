import { RegionCreateForm } from '@/components/RegionCreateForm';
import { Button } from '@/components/ui/Button';
import { LayoutWithKeyboardAvoidingScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useUpdateSettings } from '@/contexts/settings';
import { router } from 'expo-router';

export default function CreateRegionScreen() {
  const updateSettings = useUpdateSettings();

  return (
    <LayoutWithKeyboardAvoidingScroll>
      <Text className="mb-6 text-4xl">Configuración</Text>
      <Text className="mb-2 text-2xl">Crear una región</Text>
      <Text className="mb-6 text-gray-300">
        Crea una región, que determina la moneda y los impuestos del punto de venta.
      </Text>

      <RegionCreateForm
        onRegionCreated={(region) => {
          updateSettings.mutate(
            {
              region_id: region.id,
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
