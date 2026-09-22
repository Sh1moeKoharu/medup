import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useAjustesImpresion } from '@/utils/ajustes-impresion';
import { useMedusaSdk } from '@/contexts/auth';
import type { Recibo } from '@/utils/imprimir-recibo';
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
  const sdk = useMedusaSdk();
  const { ajustes, cargando, actualizar } = useAjustesImpresion();
  const [aviso, setAviso] = React.useState('');

  // La muestra la arma el SERVIDOR, con el mismo codigo que un ticket real.
  //
  // Antes se componia aqui y tomaba el nombre del canal de venta en lugar del
  // configurado en Ajustes -> Ticket: quien ponia el nombre del negocio y luego
  // imprimia una prueba veia otro nombre y concluia que el ajuste no servia.
  const probar = async () => {
    setAviso('');
    try {
      const res = await sdk.client.fetch<{ recibo: Recibo }>('/admin/receipts/muestra');
      const ok = imprimirRecibo(res.recibo);
      setAviso(
        ok
          ? 'Se envió el ticket de prueba. Si no salió papel, revisa que la impresora esté encendida y sea la predeterminada de Windows.'
          : 'Este dispositivo no puede imprimir. Usa el equipo que tiene la impresora conectada.'
      );
    } catch {
      setAviso('No se pudo obtener el ticket de prueba del servidor.');
    }
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
          <Text className="text-lg">Imprimir al completar la orden</Text>
          <Text className="text-sm text-gray-400">
            Al pulsar «Completar orden» se abre directamente la impresión del recibo.
          </Text>
        </View>
        <Switch
          value={ajustes.automatico}
          disabled={cargando}
          onValueChange={(v) => actualizar({ automatico: v })}
        />
      </View>

      <Text className="mb-8 text-sm text-gray-400">
        Apágalo en los equipos que no tienen impresora: en lugar de imprimir,
        al terminar la venta aparece un aviso con la opción de imprimir después.
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
          El ticket sale siempre por la impresora PREDETERMINADA del sistema, y
          eso se elige en el sistema, no aquí.
        </Text>
      </View>

      <Text className="mb-2 text-lg">1. Poner la térmica como predeterminada</Text>

      <Text className="mb-1 text-sm">En Windows</Text>
      <Text className="mb-4 text-sm text-gray-400">
        Configuración → Bluetooth y dispositivos → Impresoras → elige la térmica
        → Establecer como predeterminada. Desactiva también &quot;Permitir que
        Windows administre mi impresora predeterminada&quot;, o la cambiará sola.
      </Text>

      <Text className="mb-1 text-sm">En Linux</Text>
      <Text className="mb-2 text-sm text-gray-400">
        Configuración → Impresoras → elige la térmica → Opciones de impresora →
        Usar como predeterminada. Si esa pantalla no la lista, entra a CUPS en{' '}
        <Text className="text-sm text-active-500">http://localhost:631</Text>,
        pestaña Administración → Añadir impresora.
      </Text>
      <Text className="mb-2 text-sm text-gray-400">
        Desde la terminal, para ver cuáles hay y fijar la predeterminada:
      </Text>
      <View className="mb-6 rounded-xl bg-gray-50 p-3">
        <Text className="text-xs">lpstat -p -d</Text>
        <Text className="text-xs">lpoptions -d NOMBRE_DE_LA_IMPRESORA</Text>
      </View>

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
      <Text className="mb-2 text-sm text-gray-400">
        En Linux es el mismo modificador, lanzado desde la terminal o desde un
        lanzador del escritorio:
      </Text>
      <View className="mb-2 rounded-xl bg-gray-50 p-3">
        <Text className="text-xs">
          {`google-chrome --kiosk-printing --app=${
            typeof window !== 'undefined' ? window.location.origin : 'http://servidor'
          }`}
        </Text>
      </View>

      <Text className="mb-8 text-sm text-gray-400">
        Cierra TODAS las ventanas de Chrome antes de usarlo la primera vez, en
        cualquiera de los dos sistemas. Si Chrome ya estaba abierto, la ventana
        nueva se engancha al proceso anterior y la opción se ignora sin avisar.
      </Text>
    </LayoutWithScroll>
  );
}
