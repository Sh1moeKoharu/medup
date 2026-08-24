import { useRegions } from '@/api/hooks/regions';
import { useSalesChannels } from '@/api/hooks/sales-channel';
import { useStockLocations } from '@/api/hooks/stock-location';
import { SetupWizardContent } from '@/components/setup-wizard/SetupWizardContent';
import { useAuthCtx } from '@/contexts/auth';
import { useUpdateSettings } from '@/contexts/settings';
import { getHomeRoute } from '@/utils/home-route';
import { showErrorToast } from '@/utils/errors';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';

export default function SetupWizardScreen() {
  const salesChannelsQuery = useSalesChannels();
  const stockLocationsQuery = useStockLocations();
  const regionsQuery = useRegions();
  const router = useRouter();
  const auth = useAuthCtx();

  React.useEffect(() => {
    if (salesChannelsQuery.isError) {
      showErrorToast(salesChannelsQuery.error);
    }
    if (stockLocationsQuery.isError) {
      showErrorToast(stockLocationsQuery.error);
    }
    if (regionsQuery.isError) {
      showErrorToast(regionsQuery.error);
    }
  }, [
    salesChannelsQuery.isError,
    stockLocationsQuery.isError,
    regionsQuery.isError,
    salesChannelsQuery.error,
    stockLocationsQuery.error,
    regionsQuery.error,
  ]);

  const isLoading = salesChannelsQuery.isLoading || stockLocationsQuery.isLoading || regionsQuery.isLoading;

  const salesChannels = salesChannelsQuery.data?.pages?.[0]?.sales_channels ?? [];
  const stockLocations = stockLocationsQuery.data?.pages?.[0]?.stock_locations ?? [];
  const regions = regionsQuery.data?.pages?.[0]?.regions ?? [];

  /**
   * Si el servidor tiene UNA sola opción de cada cosa, no hay nada que elegir:
   * se configura solo y el asistente ni siquiera aparece.
   *
   * ── POR QUÉ HACE FALTA ──────────────────────────────────────────────────
   * Los ajustes se guardan por DISPOSITIVO (almacenamiento local), no en el
   * servidor. Así que cada navegador o tableta nueva veía el asistente
   * completo, aunque el sistema llevara meses configurado — y le pedía al
   * cajero elegir canal de venta, moneda y región, que no son decisiones suyas.
   *
   * En una clínica hay exactamente un canal, una región y una ubicación, así
   * que el caso normal queda resuelto. Si hubiera varios, el asistente sigue
   * apareciendo, que es cuando la elección sí importa.
   */
  const puedeAutoconfigurar =
    !isLoading && salesChannels.length === 1 && regions.length === 1 && stockLocations.length === 1;

  const yaIntentado = React.useRef(false);

  const updateSettings = useUpdateSettings({
    onSuccess: () => {
      const role = auth.state.status === 'authenticated' ? auth.state.user.role : undefined;
      router.replace(getHomeRoute(role) as any);
    },
    onError: () => {
      // Si la escritura falla, se deja ver el asistente en lugar de dejar al
      // usuario ante una pantalla de carga eterna.
      yaIntentado.current = true;
    },
  });

  React.useEffect(() => {
    if (!puedeAutoconfigurar || yaIntentado.current) {
      return;
    }
    yaIntentado.current = true;
    updateSettings.mutate({
      sales_channel_id: salesChannels[0].id,
      region_id: regions[0].id,
      stock_location_id: stockLocations[0].id,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeAutoconfigurar]);

  if (isLoading || (puedeAutoconfigurar && !updateSettings.isError)) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <View className="items-center gap-3">
          <ActivityIndicator size="large" className="text-gray-600" />
          {puedeAutoconfigurar && <Text className="text-gray-500">Preparando el punto de venta…</Text>}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SetupWizardContent
      hasSalesChannels={salesChannels.length > 0}
      hasStockLocations={stockLocations.length > 0}
      hasRegions={regions.length > 0}
    />
  );
}
