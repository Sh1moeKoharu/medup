import { StockLocationList } from '@/components/StockLocationList';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings, useUpdateSettings } from '@/contexts/settings';
import { router } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

export default function StockLocationScreen() {
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [selectedStockLocation, setSelectedStockLocation] = React.useState(settings.data?.stock_location?.id || '');

  return (
    <Layout className="pb-6">
      <Text className="mb-6 text-4xl">Configuración</Text>
      <Text className="mb-2 text-2xl">Elige una ubicación de inventario</Text>
      <Text className="mb-6 text-gray-300">
        Elige de qué almacén sale el inventario, o añade uno nuevo si hace falta.
      </Text>

      <StockLocationList
        selectedStockLocationId={selectedStockLocation}
        onStockLocationSelect={setSelectedStockLocation}
      />

      <View className="mt-6 gap-4">
        <Button variant="outline" onPress={() => router.push('/settings/create-stock-location')}>
          Crear ubicación
        </Button>

        <Button
          disabled={!selectedStockLocation}
          isPending={updateSettings.isPending}
          onPress={() => {
            if (!selectedStockLocation) {
              return;
            }

            updateSettings.mutate(
              {
                stock_location_id: selectedStockLocation,
              },
              {
                onSuccess: () => {
                  router.back();
                },
              },
            );
          }}
        >
          Guardar
        </Button>

        <Button variant="outline" onPress={() => router.back()}>
          Cancelar
        </Button>
      </View>
    </Layout>
  );
}
