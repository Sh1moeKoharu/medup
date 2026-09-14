import { useSurtirRequisicion } from '@/api/hooks/almacen';
import { EstadoRequisicion, Requisicion, useRequisiciones } from '@/api/hooks/requisiciones';
import { Campo, Distintivo, fechaCorta } from '@/components/almacen/base';
import { Truck } from '@/components/icons/truck';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import * as React from 'react';
import { View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Traspasos a Enfermería: las requisiciones que Enfermería pidió y Farmacia
 * surte. Surtir saca de Farmacia con caducidad más próxima y entra en
 * Enfermería con el mismo número de lote, en una sola transacción: si a algún
 * renglón no le alcanza, no se mueve nada (409). Se puede surtir menos de lo
 * pedido: el resto queda pendiente y Enfermería lo ve así.
 */

const ETIQUETA: Record<EstadoRequisicion, { texto: string; tono: 'aviso' | 'info' | 'exito' | 'gris' }> = {
  pending: { texto: 'Pendiente', tono: 'aviso' },
  dispatched: { texto: 'Surtida · en camino', tono: 'info' },
  received: { texto: 'Recibida', tono: 'exito' },
  cancelled: { texto: 'Cancelada', tono: 'gris' },
};

const Pendiente: React.FC<{ r: Requisicion }> = ({ r }) => {
  const surtir = useSurtirRequisicion();
  const [confirmando, setConfirmando] = React.useState(false);
  const pendienteDe = (i: Requisicion['items'][number]) => Math.max(0, i.quantity_requested - i.quantity_dispatched);
  const [cantidades, setCantidades] = React.useState<Record<string, string>>(() => Object.fromEntries(r.items.map((i) => [i.id, String(pendienteDe(i))])));

  const items = r.items
    .map((i) => ({ item_id: i.id, cantidad: Number(cantidades[i.id] ?? 0) }))
    .filter((x) => Number.isInteger(x.cantidad) && x.cantidad > 0);
  const total = items.reduce((s, x) => s + x.cantidad, 0);
  const valido = r.items.every((i) => {
    const n = Number(cantidades[i.id] ?? 0);
    return Number.isInteger(n) && n >= 0 && n <= pendienteDe(i);
  });

  return (
    <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg">{r.requested_by_name ?? 'Enfermería'}</Text>
          <Text className="text-sm text-gray-400">
            {fechaCorta(r.created_at)} · {r.source_location_name ?? 'Farmacia'} → {r.destination_location_name ?? 'Enfermería'}
          </Text>
        </View>
        <Distintivo tono={ETIQUETA[r.status].tono}>{ETIQUETA[r.status].texto}</Distintivo>
      </View>
      {r.notes ? <Text className="text-sm text-gray-400">«{r.notes}»</Text> : null}

      <View className="gap-2">
        {r.items.map((i) => (
          <View key={i.id} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text numberOfLines={2}>{i.product_title ?? i.variant_id}</Text>
              <Text className="text-xs text-gray-400">
                Pidió {i.quantity_requested}{i.quantity_dispatched > 0 ? ` · ya surtidas ${i.quantity_dispatched}` : ''}
              </Text>
            </View>
            <Campo
              className="w-24 text-center"
              value={cantidades[i.id] ?? ''}
              onChangeText={(t) => setCantidades((c) => ({ ...c, [i.id]: t }))}
              keyboardType="number-pad"
              accessibilityLabel={`Cantidad a surtir de ${i.product_title ?? 'renglón'}`}
            />
          </View>
        ))}
      </View>

      <Button className="self-start px-4 py-3" disabled={!valido || total === 0} isPending={surtir.isPending} onPress={() => setConfirmando(true)}>
        Surtir {total} {total === 1 ? 'unidad' : 'unidades'}
      </Button>

      <Prompt
        visible={confirmando}
        onClose={() => setConfirmando(false)}
        title="¿Surtir este traspaso?"
        description={`${total} unidades saldrán de Farmacia y entrarán en Enfermería, del lote que caduque antes. Si a algún renglón no le alcanza la existencia, no se mueve nada.`}
        submitText="Surtir"
        cancelText="Volver"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          setConfirmando(false);
          surtir.mutate(
            { id: r.id, items },
            {
              onSuccess: (res) => {
                const movidas = res.movimientos.reduce((s, m) => s + m.cantidad, 0);
                Toast.show({
                  type: 'success',
                  text1: `Traspaso surtido: ${movidas} unidades`,
                  text2: res.movimientos.map((m) => `${m.cantidad} de ${m.product_title ?? 'renglón'} (lote ${m.batch_number})`).join(' · '),
                });
              },
            },
          );
        }}
      />
    </View>
  );
};

const Historial: React.FC<{ lista: Requisicion[] }> = ({ lista }) => (
  <View className="gap-2">
    {lista.map((r) => (
      <View key={r.id} className="gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1" numberOfLines={1}>{r.requested_by_name ?? 'Enfermería'} · {fechaCorta(r.created_at)}</Text>
          <Distintivo tono={ETIQUETA[r.status].tono}>{ETIQUETA[r.status].texto}</Distintivo>
        </View>
        <Text className="text-xs text-gray-400" numberOfLines={2}>
          {r.items.map((i) => `${i.quantity_dispatched}/${i.quantity_requested} ${i.product_title ?? i.variant_id}`).join(' · ')}
          {r.dispatched_by_name ? ` · surtió ${r.dispatched_by_name}` : ''}
          {r.received_by_name ? ` · recibió ${r.received_by_name}` : ''}
        </Text>
      </View>
    ))}
  </View>
);

export default function TraspasosScreen() {
  const requisiciones = useRequisiciones();
  const todas = requisiciones.data ?? [];
  const pendientes = todas.filter((r) => r.status === 'pending');
  const resto = todas.filter((r) => r.status !== 'pending').slice(0, 20);

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Traspasos</Text>
      <Text className="mb-6 text-gray-400">Lo que Enfermería pidió a Farmacia. Al surtir, sale de aquí y entra allá con el mismo lote; Enfermería confirma cuando lo recibe.</Text>

      {requisiciones.isError ? (
        <Button variant="outline" onPress={() => requisiciones.refetch()} isPending={requisiciones.isRefetching}>
          No se pudieron cargar las requisiciones. Reintentar
        </Button>
      ) : pendientes.length === 0 ? (
        <View className="items-center gap-1 py-10">
          <Truck size={24} />
          <Text className="text-xl">Nada pendiente de surtir</Text>
          <Text className="text-center text-gray-400">Las requisiciones de Enfermería aparecerán aquí</Text>
        </View>
      ) : (
        <View className="gap-3">{pendientes.map((r) => <Pendiente key={r.id} r={r} />)}</View>
      )}

      {resto.length > 0 && (
        <View className="mt-8 gap-3">
          <View>
            <Text className="text-2xl">Anteriores</Text>
            <Text className="text-sm text-gray-400">Surtidas, recibidas y canceladas, las últimas 20.</Text>
          </View>
          <Historial lista={resto} />
        </View>
      )}
    </LayoutWithScroll>
  );
}
