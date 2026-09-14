import { useRegions } from '@/api/hooks/regions';
import { useSalesChannels } from '@/api/hooks/sales-channel';
import { useStockLocations } from '@/api/hooks/stock-location';
import { SetupWizardContent } from '@/components/setup-wizard/SetupWizardContent';
import { useAuthCtx } from '@/contexts/auth';
import { useUpdateSettings } from '@/contexts/settings';
import { getHomeRoute } from '@/utils/home-route';
import { ROLES_CONFIGURACION } from '@/constants/acceso';
import { normalizeRole, roleLabel } from '@/constants/roles';
import { Button } from '@/components/ui/Button';
import { PantallaDeAviso, ParrafoDeAviso } from '@/components/ui/PantallaDeAviso';
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
  const todasLasUbicaciones = stockLocationsQuery.data?.pages?.[0]?.stock_locations ?? [];

  /**
   * Con dos almacenes (Farmacia y Enfermería) el mostrador vende SIEMPRE de
   * Farmacia: es el que lleva `altus_area = pharmacy` en su metadata (ver
   * backend/src/lib/almacenes.ts). Si está marcado, no hay nada que elegir y
   * el asistente sigue sin aparecer. Si ninguno lo está, se ofrecen todos.
   */
  const deFarmacia = todasLasUbicaciones.filter(
    (l) => ((l as { metadata?: Record<string, unknown> | null }).metadata)?.altus_area === 'pharmacy',
  );
  const stockLocations = deFarmacia.length ? deFarmacia : todasLasUbicaciones;
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
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas">
        <View className="items-center gap-3">
          <ActivityIndicator size="large" className="text-gray-600" />
          {puedeAutoconfigurar && <Text className="text-gray-500">Preparando el punto de venta…</Text>}
        </View>
      </SafeAreaView>
    );
  }

  /**
   * Llegar hasta aquí significa que hay MÁS DE UNA opción de algo y que alguien
   * tiene que elegir. Elegir región, moneda o canal de venta no es tarea del
   * área médica ni de auditoría: equivocarse ahí deja todos los precios en otra
   * divisa sin que nada lo advierta.
   *
   * El tester encontró justo esto: un médico ante la pantalla de crear regiones
   * y configurar impuestos, porque esta barrera se levanta ANTES de que actúe el
   * enrutado por rol.
   *
   * No se redirige, se explica. Su pantalla de inicio vive detrás de esta misma
   * barrera, así que mandarlos allá los devolvería aquí en bucle.
   */
  const rol = auth.state.status === 'authenticated' ? normalizeRole(auth.state.user.role) : null;

  if (!rol || !ROLES_CONFIGURACION.includes(rol)) {
    return (
      <PantallaDeAviso
        titulo="Falta configurar el punto de venta"
        acciones={
          <Button variant="outline" onPress={() => auth.logout()}>
            Cerrar sesión
          </Button>
        }
      >
        <ParrafoDeAviso>
          Este equipo todavía no tiene elegidos la región, el canal de venta o la
          ubicación de inventario, y tu perfil{rol ? ` (${roleLabel(rol)})` : ''} no hace
          esa configuración.
        </ParrafoDeAviso>

        <ParrafoDeAviso>
          Pídele a un administrador que abra el punto de venta en este equipo una primera
          vez. Después podrás entrar con normalidad.
        </ParrafoDeAviso>
      </PantallaDeAviso>
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
