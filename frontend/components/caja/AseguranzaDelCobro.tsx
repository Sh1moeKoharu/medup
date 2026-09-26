import { useAplicarAseguranza, useAseguranzaDelCobro } from '@/api/hooks/aseguranzas';
import { Text } from '@/components/ui/Text';
import * as React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

/**
 * La aseguranza en el cobro.
 *
 * ── LO QUE SE VE ────────────────────────────────────────────────────────────
 * Si el paciente no tiene aseguranza, nada. Con una, se enseña aplicada (el
 * servidor la aplica solo al cobrar, aunque aquí no se toque nada). Con
 * varias, hay que elegir: sin elegir, el cobro no avanza y el servidor lo
 * repite con 409. El descuento va sólo a medicamentos y no se puede quitar
 * por Caja: sólo cambiar de aseguranza o marcar «Sin aseguranza» si el
 * paciente decide pagar íntegro (queda anotado en el ticket como sin
 * aseguranza).
 */
export const AseguranzaDelCobro: React.FC<{ orderId: string; onEstado?: (pendiente: boolean) => void }> = ({ orderId, onEstado }) => {
  const estado = useAseguranzaDelCobro(orderId);
  const aplicar = useAplicarAseguranza(orderId);
  const queryClient = useQueryClient();
  const lista = estado.data?.aseguranzas ?? [];
  const aplicada = estado.data?.aplicada ?? null;
  const pendiente = lista.length > 1 && !aplicada;

  // El servidor aplica la aseguranza única al abrir el cobro: el total del
  // pedido cambió y hay que volver a leerlo.
  const aplicadaId = aplicada?.id ?? null;
  React.useEffect(() => {
    if (aplicadaId) queryClient.invalidateQueries({ queryKey: ['draft-order'], exact: false });
  }, [aplicadaId, queryClient]);

  React.useEffect(() => {
    onEstado?.(pendiente);
  }, [pendiente, onEstado]);

  if (estado.isLoading || !lista.length) return null;

  return (
    <View className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Aseguranza</Text>
        {aplicar.isPending && <ActivityIndicator />}
      </View>
      {aplicada ? (
        <Text className="mt-1 text-sm text-gray-600">
          {aplicada.name} · {aplicada.discount_percent}% sólo en medicamentos{aplicada.policy_number ? ` · póliza ${aplicada.policy_number}` : ''}
        </Text>
      ) : lista.length === 1 ? (
        <Text className="mt-1 text-sm text-gray-600">
          {lista[0].name} · {lista[0].discount_percent}% sólo en medicamentos. Aplicando…
        </Text>
      ) : (
        <Text className="mt-1 text-sm text-error-500">El paciente tiene {lista.length} aseguranzas: elige con cuál se cobra.</Text>
      )}
      {lista.length > 1 && (
        <View className="mt-2 flex-row flex-wrap gap-2">
          {lista.map((a) => {
            const activa = aplicada?.id === a.id;
            return (
              <TouchableOpacity
                key={a.id}
                onPress={() => aplicar.mutate(a.id)}
                disabled={aplicar.isPending}
                accessibilityLabel={`Cobrar con ${a.name}`}
                accessibilityState={{ selected: activa }}
                className={`rounded-full border px-4 py-2 ${activa ? 'border-black bg-black' : 'border-gray-300 bg-white'}`}
              >
                <Text className={`text-sm ${activa ? 'font-semibold text-white' : 'text-gray-700'}`}>
                  {a.name} · {a.discount_percent}%
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
};
