import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { useAjustesImpresion, reciboDePrueba } from '@/utils/ajustes-impresion';
import { imprimirRecibo } from '@/utils/imprimir-recibo';
import { router } from 'expo-router';
import React from 'react';
import { Switch, TouchableOpacity, View } from 'react-native';

/**
 * Ajustes de impresión del punto de venta.
 *
 * Existe porque el cliente preguntó, con razón, por qué la impresora no se
 * configura desde el programa. La respuesta es "en parte sí", y esta pantalla
 * es esa parte: lo que depende de la aplicación se decide aquí, y lo que
 * depende del navegador y de Windows se explica aquí mismo en lugar de vivir
 * en un correo que nadie encuentra cuando hace falta.
 */
export default function AjustesImpresionScreen() {
  const settings = useSettings();
  const { ajustes, cargando, actualizar } = useAjustesImpresion();
  const [aviso, setAviso] = React.useState('');

  const probar = () => {
    setAviso('');
    const ok = imprimirRecibo(
      reciboDePrueba(
        settings.data?.sales_channel?.name || 'Farmacia',
        (settings.data?.region?.currency_code || 'mxn').toUpperCase()
      ) as any
    );
    setAviso(
      ok
        ? 'Se envió el ticket de prueba. Si no salió papel, revisa que la impresora esté encendida y sea la predeterminada de Windows.'
        : 'Este dispositivo no puede imprimir. Usa el equipo que tiene la impresora conectada.'
    );
  };

  return (
    <LayoutWithScroll>
      <TouchableOpacity onPress={() => router.back()} className="mt-8">
        <Text className="text-gray-400">← Ajustes</Text>
      </TouchableOpacity>

      <Text className="mt-4 mb-6 text-4xl">Impresión</Text>

      {/* ── Lo que sí se decide aquí ──────────────────────────────────────── */}
      <Text className="mb-4 text-2xl">En este equipo</Text>

      <View className="mb-2 flex-row items-center justify-between rounded-2xl border border-gray-200 p-4">
        <View className="flex-1 pr-4">
          <Text className="text-lg">Imprimir al terminar la venta</Text>
          <Text className="text-sm text-gray-400">
            El ticket sale solo al confirmar el cobro, sin pulsar nada.
          </Text>
        </View>
        <Switch
          value={ajustes.automatico}
          disabled={cargando}
          onValueChange={(v) => actualizar({ automatico: v })}
        />
      </View>

      <Text className="mb-8 text-sm text-gray-400">
        Actívalo sólo en la caja que tiene la impresora conectada. En una tableta
        de consulta, cada venta abriría un diálogo de impresión inútil.
      </Text>

      <Text className="mb-4 text-2xl">Probar</Text>
      <Button variant="outline" className="mb-2" onPress={probar}>
        Imprimir ticket de prueba
      </Button>
      {!!aviso && (
        <InfoBanner colorScheme="info" className="mb-8">
          {aviso}
        </InfoBanner>
      )}
      {!aviso && <View className="mb-8" />}

      {/* ── Lo que NO se puede decidir aquí, y por qué ────────────────────── */}
      <Text className="mb-4 text-2xl">Elegir la impresora</Text>

      <View className="mb-4 rounded-2xl border border-gray-200 p-4">
        <Text className="mb-2">
          La impresora no se elige desde aquí, y no es una carencia del sistema:
          ningún navegador permite que una página vea las impresoras del equipo
          ni seleccione una. Es una restricción de seguridad.
        </Text>
        <Text className="text-sm text-gray-400">
          El ticket sale siempre por la impresora PREDETERMINADA de Windows.
        </Text>
      </View>

      <Text className="mb-2 text-lg">1. Poner la térmica como predeterminada</Text>
      <Text className="mb-6 text-sm text-gray-400">
        Configuración → Bluetooth y dispositivos → Impresoras → elige la térmica
        → Establecer como predeterminada. Desactiva también &quot;Permitir que
        Windows administre mi impresora predeterminada&quot;, o la cambiará sola.
      </Text>

      <Text className="mb-2 text-lg">2. Quitar el diálogo de impresión</Text>
      <Text className="mb-2 text-sm text-gray-400">
        Para que el ticket salga sin preguntar, el punto de venta debe abrirse
        con Chrome en modo de impresión directa. Crea un acceso directo en el
        escritorio con este destino:
      </Text>
      <View className="mb-2 rounded-xl bg-gray-50 p-3">
        {/* La dirección se toma del origen actual: es exactamente la que hay
            que poner, y sigue siendo correcta aunque el servidor cambie de IP. */}
        <Text className="text-xs">
          {`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=${
            typeof window !== 'undefined' ? window.location.origin : 'http://servidor'
          }`}
        </Text>
      </View>
      <Text className="mb-8 text-sm text-gray-400">
        Cierra TODAS las ventanas de Chrome antes de usarlo la primera vez. Si
        Chrome ya estaba abierto, la ventana nueva se engancha al proceso
        anterior y la opción se ignora sin avisar.
      </Text>
    </LayoutWithScroll>
  );
}
