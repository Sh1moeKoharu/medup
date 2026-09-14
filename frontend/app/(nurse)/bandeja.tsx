import { useProducts } from '@/api/hooks/products';
import { useAjustarOrden, useAplicarOrden, useBandeja, useImprimirDocumento, type ResultadoDeAplicar } from '@/api/hooks/clinica';
import type { OrdenMedica } from '@/api/hooks/medical-orders';
import { NotaDeAtencion } from '@/components/clinica/NotaDeAtencion';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Minus } from '@/components/icons/minus';
import { Plus } from '@/components/icons/plus';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatearDinero } from '@/utils/dinero';
import { clx } from '@/utils/clx';
import { color } from '@/theme/tokens';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';

/**
 * La bandeja de Enfermería: las órdenes que el médico dirigió a consulta.
 *
 * Por cada orden pendiente Enfermería puede ajustar lo que de verdad se usó
 * (una gasa más, una ampolleta menos) y APLICARLA: sale de su almacén y se
 * carga a la cuenta del paciente, que Caja cobra. Después, la nota de
 * atención y la impresión de la receta.
 */

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Boton: React.FC<{ onPress: () => void; label: string; children: React.ReactNode }> = ({ onPress, label, children }) => (
  <Pressable onPress={onPress} accessibilityLabel={label} className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200">
    {children}
  </Pressable>
);

/**
 * Una orden de la bandeja. Cuando se aplica, la lista de pendientes deja de
 * traerla, así que el resultado (lotes, cuenta, nota) vive en la pantalla y no
 * aquí: si viviera aquí, desaparecería con la tarjeta justo cuando hay que
 * escribir la nota.
 */
const Orden: React.FC<{ orden: OrdenMedica; resultado?: ResultadoDeAplicar; onAplicada: (r: ResultadoDeAplicar) => void; onCerrar: () => void }> = ({ orden, resultado, onAplicada, onCerrar }) => {
  const [abierta, setAbierta] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const termino = useDebouncedValue(busqueda, 300);
  const productos = useProducts(termino.trim().length >= 2 ? { q: termino.trim() } : undefined, 6, { enabled: termino.trim().length >= 2 });
  const ajustar = useAjustarOrden();
  const aplicar = useAplicarOrden();
  const imprimir = useImprimirDocumento();
  const [confirmando, setConfirmando] = React.useState(false);

  const unidades = orden.items.reduce((s, i) => s + i.quantity, 0);

  const cambiar = (variantId: string, cantidad: number, titulo?: string | null) =>
    ajustar.mutate({ id: orden.id, items: [{ variant_id: variantId, quantity: Math.max(0, cantidad), product_title: titulo ?? undefined }] });

  const resultados = productos.data?.pages?.[0]?.products ?? [];

  if (resultado) {
    return (
      <View className="gap-3 rounded-2xl border border-success-300 bg-white p-4">
        <Text className="text-lg">Orden aplicada · {orden.customer_name ?? orden.customer_id}</Text>
        {resultado.lotes.map((l, i) => (
          <Text key={i} className="text-sm text-gray-500">
            {l.cantidad} × {l.product_title} — lote {l.batch_number} (quedan {l.saldo_restante})
          </Text>
        ))}
        {resultado.cuenta ? (
          <Text className="text-sm text-success-500">
            Cargado a la cuenta del paciente: {resultado.cuenta.items.length} renglones, {formatearDinero(resultado.cuenta.total, resultado.cuenta.currency_code)}. Caja lo cobra desde Pacientes.
          </Text>
        ) : (
          <Text className="text-sm text-error-500">{resultado.advertencia ?? 'No se pudo cargar a la cuenta del paciente.'}</Text>
        )}
        <Button variant="outline" className="self-start px-4 py-3" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
          Imprimir receta
        </Button>
        <NotaDeAtencion customerId={orden.customer_id} medicalOrderId={orden.id} contexto={orden.customer_name ?? undefined} />
        <Button variant="outline" className="self-start px-4 py-3" onPress={onCerrar}>
          Listo
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <Pressable onPress={() => setAbierta((a) => !a)} accessibilityRole="button" accessibilityLabel={`Orden de ${orden.customer_name ?? 'paciente'}`}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg">{orden.customer_name || orden.customer_id}</Text>
            <Text className="text-sm text-gray-400">
              {fechaCorta(orden.created_at)} · {orden.creator_name ?? 'médico'} · {orden.items.length} {orden.items.length === 1 ? 'renglón' : 'renglones'} · {unidades} u.
            </Text>
          </View>
          <View className="rounded-full bg-warning-200 px-3 py-1">
            <Text className="text-xs text-warning-500">Pendiente</Text>
          </View>
        </View>
      </Pressable>

      {abierta && (
        <View className="mt-2 gap-3 border-t border-gray-100 pt-3">
          {orden.items.map((i) => (
            <View key={i.id} className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text>{i.product_title ?? i.variant_id}</Text>
                {!!i.instructions && <Text className="text-sm text-gray-400">{i.instructions}</Text>}
              </View>
              <Boton onPress={() => cambiar(i.variant_id, i.quantity - 1, i.product_title)} label="Una menos"><Minus size={16} /></Boton>
              <Text className="w-8 text-center text-lg">{i.quantity}</Text>
              <Boton onPress={() => cambiar(i.variant_id, i.quantity + 1, i.product_title)} label="Una más"><Plus size={16} /></Boton>
            </View>
          ))}
          {!!orden.notes && <Text className="text-sm text-gray-400">Notas: {orden.notes}</Text>}

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Añadir material o medicamento"
            placeholderTextColor={color.textoTerciario}
            autoCorrect={false}
            className="min-h-toque rounded-xl border border-gray-300 bg-white px-4 py-3 text-base"
          />
          {termino.trim().length >= 2 && (
            <View className="rounded-2xl border border-gray-200">
              {resultados.length === 0 ? (
                <Text className="p-3 text-gray-400">{productos.isLoading ? 'Buscando…' : 'Sin resultados'}</Text>
              ) : (
                resultados.map((p) => {
                  const v = p.variants?.[0];
                  if (!v) return null;
                  const existente = orden.items.find((i) => i.variant_id === v.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        cambiar(v.id, (existente?.quantity ?? 0) + 1, p.title);
                        setBusqueda('');
                      }}
                      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel={`Añadir ${p.title} a la orden`}
                    >
                      <Text className="flex-1" numberOfLines={2}>{p.title}</Text>
                      <Plus size={18} className="text-gray-500" />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          <View className="flex-row gap-2">
            <Button variant="outline" className="px-4" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
              Imprimir
            </Button>
            <Button className={clx('flex-1')} disabled={orden.items.length === 0} isPending={aplicar.isPending} onPress={() => setConfirmando(true)}>
              Aplicar ({unidades})
            </Button>
          </View>
        </View>
      )}

      <Prompt
        visible={confirmando}
        onClose={() => setConfirmando(false)}
        title="¿Aplicar esta orden?"
        description={`Saldrá del almacén de Enfermería y se cargará a la cuenta de ${orden.customer_name ?? 'el paciente'} para que Caja lo cobre. Si a algo no le alcanza la existencia, no se aplica nada.`}
        submitText="Aplicar"
        cancelText="Revisar"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          aplicar.mutate(orden.id, {
            onSuccess: (r) => onAplicada(r),
            onSettled: () => setConfirmando(false),
          });
        }}
      />
    </View>
  );
};

export default function BandejaScreen() {
  const bandeja = useBandeja('nursing');
  // Las recién aplicadas se quedan a la vista hasta que Enfermería pulse
  // «Listo»: es el momento de la nota de atención y de imprimir la receta.
  const [aplicadas, setAplicadas] = React.useState<Record<string, { orden: OrdenMedica; resultado: ResultadoDeAplicar }>>({});
  const lista = (bandeja.data ?? []).filter((o) => !aplicadas[o.id]);
  const recientes = Object.values(aplicadas);

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Bandeja</Text>
      <Text className="mb-6 text-gray-400">Órdenes que el médico dirigió a consulta. Ajusta lo que se usó y aplícala: sale de tu almacén y queda en la cuenta del paciente.</Text>

      {recientes.length > 0 && (
        <View className="mb-3 gap-3">
          {recientes.map(({ orden, resultado }) => (
            <Orden
              key={orden.id}
              orden={orden}
              resultado={resultado}
              onAplicada={() => undefined}
              onCerrar={() => setAplicadas((a) => { const { [orden.id]: _fuera, ...resto } = a; return resto; })}
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
          <Text className="text-xl">Sin órdenes pendientes</Text>
          <Text className="text-center text-gray-400">Las órdenes que el médico dirija a Enfermería aparecerán aquí</Text>
        </View>
      ) : (
        <View className="gap-3">
          {lista.map((o) => (
            <Orden
              key={o.id}
              orden={o}
              onAplicada={(r) => setAplicadas((a) => ({ ...a, [o.id]: { orden: o, resultado: r } }))}
              onCerrar={() => undefined}
            />
          ))}
        </View>
      )}
    </LayoutWithScroll>
  );
}
