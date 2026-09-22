import { ResultadoDeSurtido, useRecetasSurtidas, useSurtirReceta } from '@/api/hooks/almacen';
import { useAjustarOrden, useBandeja, useImprimirDocumento } from '@/api/hooks/clinica';
import { HistorialDeAjustes, MotivoDeAjuste } from '@/components/clinica/Ajustes';
import { Minus } from '@/components/icons/minus';
import { Trash2 } from '@/components/icons/trash-2';
import { color } from '@/theme/tokens';
import type { OrdenMedica } from '@/api/hooks/medical-orders';
import { Distintivo, fechaCorta } from '@/components/almacen/base';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import * as React from 'react';
import { Pressable, View } from 'react-native';

/**
 * La bandeja de Farmacia: las recetas que el médico dirigió al mostrador.
 *
 * Surtir descuenta del almacén de Farmacia con caducidad más próxima y deja
 * la receta como surtida; si a algún renglón no le alcanza la existencia, el
 * servidor responde 409 y no mueve nada. Lo que Enfermería aplica en consulta
 * no pasa por aquí: va por su propia bandeja.
 *
 * Igual que en Enfermería, la receta recién surtida se queda a la vista hasta
 * pulsar «Listo»: es el momento de imprimirla.
 */

const Receta: React.FC<{ orden: OrdenMedica; resultado?: ResultadoDeSurtido; onSurtida: (r: ResultadoDeSurtido) => void; onCerrar: () => void }> = ({ orden, resultado, onSurtida, onCerrar }) => {
  const [abierta, setAbierta] = React.useState(false);
  const [confirmando, setConfirmando] = React.useState(false);
  const surtir = useSurtirReceta();
  const imprimir = useImprimirDocumento();
  const ajustar = useAjustarOrden();
  // Farmacia puede quitar o reducir lo que no va a surtir, siempre con motivo.
  const [porReducir, setPorReducir] = React.useState<{ variant_id: string; cantidad: number; antes: number; titulo: string | null } | null>(null);
  const unidades = orden.items.reduce((s, i) => s + i.quantity, 0);

  if (resultado) {
    return (
      <View className="gap-3 rounded-2xl border border-success-300 bg-white p-4">
        <Text className="text-lg">Receta surtida · {orden.customer_name ?? orden.customer_id}</Text>
        {resultado.lotes.map((l, i) => (
          <Text key={i} className="text-sm text-gray-500">
            {l.cantidad} × {l.product_title} — lote {l.batch_number} (quedan {l.saldo_restante})
          </Text>
        ))}
        {resultado.advertencia ? <Text className="text-sm text-warning-500">{resultado.advertencia}</Text> : null}
        <View className="flex-row flex-wrap gap-2">
          <Button variant="outline" className="px-4 py-3" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
            Imprimir receta
          </Button>
          <Button variant="outline" className="px-4 py-3" onPress={onCerrar}>
            Listo
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <Pressable onPress={() => setAbierta((a) => !a)} accessibilityRole="button" accessibilityLabel={`Receta de ${orden.customer_name ?? 'paciente'}`}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg">{orden.customer_name || orden.customer_id}</Text>
            <Text className="text-sm text-gray-400">
              {fechaCorta(orden.created_at)} · {orden.creator_name ?? 'médico'} · {orden.items.length} {orden.items.length === 1 ? 'renglón' : 'renglones'} · {unidades} u.
            </Text>
          </View>
          <Distintivo tono="aviso">Pendiente</Distintivo>
        </View>
      </Pressable>

      {abierta && (
        <View className="mt-2 gap-2 border-t border-gray-100 pt-3">
          {orden.items.map((i) => (
            <View key={i.id} className="gap-2">
              <View className="flex-row items-center gap-3">
                <Text className="w-10 text-right text-gray-500">{i.quantity}</Text>
                <View className="flex-1">
                  <Text>{i.product_title ?? i.variant_id}</Text>
                  {i.instructions ? <Text className="text-xs text-gray-400">{i.instructions}</Text> : null}
                </View>
                {i.quantity > 1 && (
                  <Pressable
                    onPress={() => setPorReducir({ variant_id: i.variant_id, cantidad: i.quantity - 1, antes: i.quantity, titulo: i.product_title })}
                    accessibilityLabel={`Surtir una menos de ${i.product_title ?? 'este renglón'}`}
                    className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200"
                  >
                    <Minus size={16} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => setPorReducir({ variant_id: i.variant_id, cantidad: 0, antes: i.quantity, titulo: i.product_title })}
                  accessibilityLabel={`Quitar ${i.product_title ?? 'este renglón'} de la receta`}
                  className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200"
                >
                  <Trash2 size={16} color={color.iconoError} />
                </Pressable>
              </View>
              {porReducir?.variant_id === i.variant_id && (
                <MotivoDeAjuste
                  descripcion={porReducir.cantidad === 0 ? `Quitar ${i.product_title ?? 'este renglón'} de la receta.` : `Surtir ${porReducir.cantidad} en lugar de ${porReducir.antes}.`}
                  enviando={ajustar.isPending}
                  onCancelar={() => setPorReducir(null)}
                  onConfirmar={(motivo) =>
                    ajustar.mutate(
                      { id: orden.id, motivo, items: [{ variant_id: porReducir.variant_id, quantity: porReducir.cantidad, product_title: porReducir.titulo ?? undefined }] },
                      { onSuccess: () => setPorReducir(null) },
                    )
                  }
                />
              )}
            </View>
          ))}
          {orden.notes ? <Text className="text-sm text-gray-400">«{orden.notes}»</Text> : null}
          <HistorialDeAjustes ajustes={orden.ajustes} />
          <View className="mt-1 flex-row flex-wrap gap-2">
            <Button className="px-4 py-3" onPress={() => setConfirmando(true)} isPending={surtir.isPending}>
              Surtir ({unidades})
            </Button>
            <Button variant="outline" className="px-4 py-3" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
              Imprimir
            </Button>
          </View>
        </View>
      )}

      <Prompt
        visible={confirmando}
        onClose={() => setConfirmando(false)}
        title="¿Surtir esta receta?"
        description={`${unidades} unidades saldrán del almacén de Farmacia, del lote que caduque antes. No se puede deshacer.`}
        submitText="Surtir"
        cancelText="Volver"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          setConfirmando(false);
          surtir.mutate(orden.id, { onSuccess: (r) => onSurtida(r) });
        }}
      />
    </View>
  );
};

const Surtidas: React.FC = () => {
  const surtidas = useRecetasSurtidas();
  const imprimir = useImprimirDocumento();
  const [abierta, setAbierta] = React.useState(false);
  const lista = surtidas.data ?? [];
  if (!lista.length) return null;
  return (
    <View className="mt-8 gap-2">
      <Pressable onPress={() => setAbierta((a) => !a)} accessibilityRole="button" accessibilityState={{ expanded: abierta }}>
        <Text className="text-2xl">Surtidas recientemente</Text>
        <Text className="text-sm text-gray-400">{abierta ? 'Las últimas 20. Toca para ocultar.' : `${lista.length} recetas. Toca para ver.`}</Text>
      </Pressable>
      {abierta &&
        lista.map((o) => (
          <View key={o.id} className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <View className="flex-1">
              <Text numberOfLines={1}>{o.customer_name ?? o.customer_id}</Text>
              <Text className="text-xs text-gray-400">
                {fechaCorta(o.dispensed_at ?? o.updated_at)}{o.dispensed_by_name ? ` · surtió ${o.dispensed_by_name}` : ''} · {o.items.length} {o.items.length === 1 ? 'renglón' : 'renglones'}
              </Text>
            </View>
            <Button variant="outline" className="px-4 py-2" onPress={() => imprimir.mutate({ tipo: 'receta', id: o.id })} isPending={imprimir.isPending}>
              Imprimir
            </Button>
          </View>
        ))}
    </View>
  );
};

export default function RecetasDeFarmaciaScreen() {
  const bandeja = useBandeja('pharmacy');
  const [surtidas, setSurtidas] = React.useState<Record<string, { orden: OrdenMedica; resultado: ResultadoDeSurtido }>>({});
  const lista = (bandeja.data ?? []).filter((o) => !surtidas[o.id]);
  const recientes = Object.values(surtidas);

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Recetas</Text>
      <Text className="mb-6 text-gray-400">Las recetas de mostrador pendientes de surtir. Surtir descuenta del almacén general, del lote que caduque antes; quitar o reducir pide motivo.</Text>

      {recientes.length > 0 && (
        <View className="mb-3 gap-3">
          {recientes.map(({ orden, resultado }) => (
            <Receta
              key={orden.id}
              orden={orden}
              resultado={resultado}
              onSurtida={() => undefined}
              onCerrar={() => setSurtidas((a) => { const { [orden.id]: _fuera, ...resto } = a; return resto; })}
            />
          ))}
        </View>
      )}

      {bandeja.isError ? (
        <Button variant="outline" onPress={() => bandeja.refetch()} isPending={bandeja.isRefetching}>
          No se pudo cargar la bandeja. Reintentar
        </Button>
      ) : lista.length === 0 && recientes.length === 0 ? (
        <View className="items-center gap-1 py-10">
          <ClipboardList size={24} />
          <Text className="text-xl">Sin recetas pendientes</Text>
          <Text className="text-center text-gray-400">Las recetas que el médico dirija a Farmacia aparecerán aquí</Text>
        </View>
      ) : (
        <View className="gap-3">
          {lista.map((o) => (
            <Receta key={o.id} orden={o} onSurtida={(r) => setSurtidas((a) => ({ ...a, [o.id]: { orden: o, resultado: r } }))} onCerrar={() => undefined} />
          ))}
        </View>
      )}

      <Surtidas />
    </LayoutWithScroll>
  );
}
