import { abrirCuentaParaCobro } from '@/api/hooks/draft-orders';
import { usePorCobrar, type CuentaPendiente } from '@/api/hooks/clinica';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import { formatearDinero } from '@/utils/dinero';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

/**
 * «Por cobrar»: la lista de trabajo de Caja, con el botón en la fila.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * «Cobrar cuenta» existía, pero enterrado: Pacientes → buscar → abrir la
 * ficha → ahí estaba. Caja tenía que saber de antemano que ese paciente tenía
 * cuenta. La acción principal del puesto no puede vivir a tres toques.
 *
 * ── DOS ESTADOS, Y POR QUÉ SE ENSEÑAN LOS DOS ───────────────────────────────
 * Por cobrar: lo que Enfermería ya aplicó. Se cobra desde aquí.
 * Esperando a Enfermería: el médico ya emitió, Enfermería aún no aplica. Va
 * en gris y sin botón. Sin esta fila, Caja iba a buscar una cuenta que
 * todavía no existía, o —peor— armaba una venta de mostrador con los mismos
 * medicamentos, que salían de Farmacia además de haber salido ya de
 * Enfermería. Nadie cobra lo que Enfermería no aplicó, y aquí se ve por qué.
 *
 * Con la caja cerrada la lista se ve igual, pero el botón está apagado y dice
 * qué falta: abrirla. Es la razón para abrirla, no un obstáculo.
 */

const espera = (iso: string) => {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} d`;
};

const Fila: React.FC<{ cuenta: CuentaPendiente; puedeCobrar: boolean; onCobrar: (c: CuentaPendiente) => void; cobrando: boolean }> = ({ cuenta, puedeCobrar, onCobrar, cobrando }) => {
  const quienAplico = cuenta.medical_orders.find((o) => o.dispensed_by_name)?.dispensed_by_name;
  const renglones = cuenta.items.reduce((s, i) => s + i.quantity, 0);
  return (
    <View className="flex-row items-center gap-3 border-b border-gray-100 px-4 py-3">
      <View className="flex-1">
        <Text className="text-base" numberOfLines={1}>
          {cuenta.customer_name ?? 'Paciente sin nombre'}
        </Text>
        <Text className="text-sm text-gray-400" numberOfLines={1}>
          {cuenta.medical_orders.length === 1 ? 'Consulta' : cuenta.medical_orders.length > 1 ? `${cuenta.medical_orders.length} consultas` : 'Cuenta'} · {renglones} {renglones === 1 ? 'unidad' : 'unidades'}
          {quienAplico ? ` · aplicó ${quienAplico}` : ''} · {espera(cuenta.created_at)}
        </Text>
      </View>
      <Text className="text-lg">{formatearDinero(cuenta.total, cuenta.currency_code)}</Text>
      <Button className="px-4 py-3" disabled={!puedeCobrar} isPending={cobrando} onPress={() => onCobrar(cuenta)} accessibilityLabel={`Cobrar la cuenta de ${cuenta.customer_name ?? 'paciente'}`}>
        Cobrar
      </Button>
    </View>
  );
};

export const PorCobrar: React.FC<{
  /** Con la caja cerrada el botón se apaga y se dice por qué. */
  puedeCobrar: boolean;
  /** Con la caja cerrada, no ocupar sitio si no hay nada. */
  soloSiHay?: boolean;
}> = ({ puedeCobrar, soloSiHay = false }) => {
  const router = useRouter();
  const porCobrar = usePorCobrar();
  const [cobrando, setCobrando] = React.useState<string | null>(null);

  const cuentas = porCobrar.data?.cuentas ?? [];
  const esperando = porCobrar.data?.esperando ?? [];
  const vacio = cuentas.length === 0 && esperando.length === 0;

  if (soloSiHay && (vacio || porCobrar.isPending)) return null;

  const cobrar = async (cuenta: CuentaPendiente) => {
    setCobrando(cuenta.id);
    try {
      // El cobro es el de siempre: la cuenta pasa a ser el carrito de esta
      // caja y se completa en /checkout.
      await abrirCuentaParaCobro(cuenta.id);
      router.push(`/checkout/${cuenta.id}`);
    } finally {
      setCobrando(null);
    }
  };

  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-2xl">Por cobrar{cuentas.length > 0 ? ` (${cuentas.length})` : ''}</Text>
        {!puedeCobrar && cuentas.length > 0 && <Text className="text-sm text-warning-500">Abre la caja para cobrar</Text>}
      </View>

      {porCobrar.isError ? (
        <Button variant="outline" onPress={() => porCobrar.refetch()} isPending={porCobrar.isRefetching}>
          No se pudo cargar lo pendiente. Reintentar
        </Button>
      ) : vacio ? (
        <Text className="text-gray-400">{porCobrar.isPending ? 'Consultando…' : 'Nada por cobrar. Lo que Enfermería aplique aparecerá aquí solo.'}</Text>
      ) : (
        <View className="rounded-2xl border border-gray-200 bg-white">
          {cuentas.map((c) => (
            <Fila key={c.id} cuenta={c} puedeCobrar={puedeCobrar} onCobrar={cobrar} cobrando={cobrando === c.id} />
          ))}
          {esperando.map((p) => (
            <View key={p.customer_id} className={clx('flex-row items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3')} accessibilityLabel={`${p.customer_name ?? 'Paciente'}: esperando a Enfermería`}>
              <View className="flex-1">
                <Text className="text-base text-gray-500" numberOfLines={1}>
                  {p.customer_name ?? 'Paciente sin nombre'}
                </Text>
                <Text className="text-sm text-gray-400" numberOfLines={1}>
                  {p.pendientes === 1 ? '1 orden' : `${p.pendientes} órdenes`} · {espera(p.desde)}
                </Text>
              </View>
              <View className="rounded-full bg-warning-200 px-3 py-1">
                <Text className="text-xs text-warning-500">Esperando a Enfermería</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
