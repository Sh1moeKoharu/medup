import { useProducts } from '@/api/hooks/products';
import { AltaDeLote } from '@/components/almacen/AltaDeLote';
import { Campo, CampoConEtiqueta, nombreDeAlmacen } from '@/components/almacen/base';
import {
  EstadoRequisicion,
  LoteDeAlmacen,
  Requisicion,
  useAlmacenes,
  useBajaDeLote,
  useCancelarRequisicion,
  useCrearRequisicion,
  useLotesDeAlmacen,
  useRecibirRequisicion,
  useRequisiciones,
} from '@/api/hooks/requisiciones';
import { Minus } from '@/components/icons/minus';
import { Plus } from '@/components/icons/plus';
import { Trash2 } from '@/components/icons/trash-2';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useAuthenticated } from '@/contexts/auth';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * El almacén de Enfermería, desde el punto de venta.
 *
 * Cuatro cosas, en el orden en que pasan en el día: pedir a Farmacia lo que
 * falta, ver en qué va cada pedido (y confirmar que llegó), dar de alta lo que
 * llegó por otra vía, y dar de baja lo que se rompió o se contaminó, con su
 * motivo. Todo lo que aquí se hace deja asiento en el kardex de Enfermería; el
 * traspaso también en el de Farmacia.
 *
 * ── EL ALTA ─────────────────────────────────────────────────────────────────
 * Lo que entra por requisición se registra solo al confirmar que llegó. Pero
 * no todo entra así: una compra directa, una donación o la carga inicial no
 * tienen requisición, y hasta ahora no había forma de meterlas: ese material
 * se usaba sin existir en el sistema. El servidor ya limitaba a Enfermería a
 * su propio almacén; faltaba la pantalla. Sin costos: Enfermería no los ve.
 */

const ETIQUETA: Record<EstadoRequisicion, { texto: string; fondo: string; tinta: string }> = {
  pending: { texto: 'Pendiente en Farmacia', fondo: 'bg-warning-200', tinta: 'text-warning-500' },
  dispatched: { texto: 'Surtida · confirma que llegó', fondo: 'bg-info-200', tinta: 'text-info-500' },
  received: { texto: 'Recibida', fondo: 'bg-success-200', tinta: 'text-success-500' },
  cancelled: { texto: 'Cancelada', fondo: 'bg-gray-100', tinta: 'text-gray-500' },
};

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};


const Seccion: React.FC<{ titulo: string; descripcion: string; children: React.ReactNode }> = ({ titulo, descripcion, children }) => (
  <View className="mb-8 gap-3">
    <View>
      <Text className="text-2xl">{titulo}</Text>
      <Text className="text-sm text-gray-400">{descripcion}</Text>
    </View>
    {children}
  </View>
);

// ── Pedir a Farmacia ────────────────────────────────────────────────────────

type Renglon = { variant_id: string; product_title: string; quantity: number };

const PedirAFarmacia: React.FC = () => {
  const [busqueda, setBusqueda] = React.useState('');
  const termino = useDebouncedValue(busqueda, 300);
  const productos = useProducts(termino.trim().length >= 2 ? { q: termino.trim() } : undefined, 8, {
    enabled: termino.trim().length >= 2,
  });
  const [renglones, setRenglones] = React.useState<Renglon[]>([]);
  const [notas, setNotas] = React.useState('');
  const crear = useCrearRequisicion();

  const resultados = productos.data?.pages?.[0]?.products ?? [];

  const agregar = (variantId: string, titulo: string) => {
    setRenglones((lista) => {
      const existente = lista.find((r) => r.variant_id === variantId);
      if (existente) {
        return lista.map((r) => (r.variant_id === variantId ? { ...r, quantity: r.quantity + 1 } : r));
      }
      return [...lista, { variant_id: variantId, product_title: titulo, quantity: 1 }];
    });
    setBusqueda('');
  };

  const cambiar = (variantId: string, delta: number) =>
    setRenglones((lista) =>
      lista
        .map((r) => (r.variant_id === variantId ? { ...r, quantity: r.quantity + delta } : r))
        .filter((r) => r.quantity > 0),
    );

  const enviar = () => {
    crear.mutate(
      { items: renglones, notes: notas.trim() || undefined },
      {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: 'Requisición enviada a Farmacia' });
          setRenglones([]);
          setNotas('');
        },
      },
    );
  };

  return (
    <Seccion titulo="Pedir a Farmacia" descripcion="Busca el medicamento y di cuántas unidades hacen falta en Enfermería.">
      <Campo value={busqueda} onChangeText={setBusqueda} placeholder="Buscar medicamento" autoCorrect={false} />

      {termino.trim().length >= 2 && (
        <View className="rounded-2xl border border-gray-200 bg-white">
          {productos.isLoading ? (
            <Text className="p-4 text-gray-400">Buscando…</Text>
          ) : resultados.length === 0 ? (
            <Text className="p-4 text-gray-400">Sin resultados para «{termino}»</Text>
          ) : (
            resultados.map((p) => {
              const variante = p.variants?.[0];
              if (!variante) return null;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => agregar(variante.id, p.title)}
                  className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
                  accessibilityRole="button"
                  accessibilityLabel={`Añadir ${p.title}`}
                >
                  <Text className="flex-1" numberOfLines={2}>{p.title}</Text>
                  <Plus size={18} className="text-gray-500" />
                </Pressable>
              );
            })
          )}
        </View>
      )}

      {renglones.length > 0 && (
        <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
          {renglones.map((r) => (
            <View key={r.variant_id} className="flex-row items-center gap-3">
              <Text className="flex-1" numberOfLines={2}>{r.product_title}</Text>
              <Pressable onPress={() => cambiar(r.variant_id, -1)} className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200" accessibilityLabel="Una menos">
                <Minus size={16} />
              </Pressable>
              <Text className="w-8 text-center text-lg">{r.quantity}</Text>
              <Pressable onPress={() => cambiar(r.variant_id, 1)} className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200" accessibilityLabel="Una más">
                <Plus size={16} />
              </Pressable>
              <Pressable onPress={() => cambiar(r.variant_id, -r.quantity)} className="min-h-toque min-w-toque items-center justify-center" accessibilityLabel="Quitar">
                <Trash2 size={16} className="text-gray-400" />
              </Pressable>
            </View>
          ))}
          <Campo value={notas} onChangeText={setNotas} placeholder="Notas para Farmacia (opcional)" className="mt-2" />
          <Button className="mt-2" onPress={enviar} isPending={crear.isPending}>
            Enviar requisición
          </Button>
        </View>
      )}
    </Seccion>
  );
};

// ── Mis requisiciones ───────────────────────────────────────────────────────

const MisRequisiciones: React.FC = () => {
  const { user } = useAuthenticated();
  const requisiciones = useRequisiciones({ requested_by_id: user.id });
  const recibir = useRecibirRequisicion();
  const cancelar = useCancelarRequisicion();
  const [aCancelar, setACancelar] = React.useState<Requisicion | null>(null);

  const lista = requisiciones.data ?? [];

  return (
    <Seccion titulo="Mis requisiciones" descripcion="En qué va cada pedido. Cuando Farmacia surta, confirma aquí que lo recibiste.">
      {requisiciones.isError ? (
        <Button variant="outline" onPress={() => requisiciones.refetch()} isPending={requisiciones.isRefetching}>
          No se pudieron cargar. Reintentar
        </Button>
      ) : lista.length === 0 ? (
        <Text className="text-gray-400">Todavía no has pedido nada.</Text>
      ) : (
        lista.map((r) => {
          const e = ETIQUETA[r.status] ?? ETIQUETA.pending;
          return (
            <View key={r.id} className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
              <View className="flex-row items-start justify-between gap-3">
                <Text className="text-sm text-gray-400">{fechaCorta(r.created_at)}</Text>
                <View className={clx('rounded-full px-3 py-1', e.fondo)}>
                  <Text className={clx('text-xs', e.tinta)}>{e.texto}</Text>
                </View>
              </View>
              {r.items.map((i) => (
                <View key={i.id} className="flex-row gap-2">
                  <Text className="w-20 text-gray-400">
                    {i.quantity_dispatched}/{i.quantity_requested}
                  </Text>
                  <Text className="flex-1">{i.product_title ?? i.variant_id}</Text>
                </View>
              ))}
              {r.status === 'dispatched' && (
                <Button className="mt-1 self-start px-4 py-3" onPress={() => recibir.mutate({ id: r.id })} isPending={recibir.isPending}>
                  Confirmar que llegó
                </Button>
              )}
              {r.status === 'pending' && r.items.every((i) => i.quantity_dispatched === 0) && (
                <Button variant="outline" className="mt-1 self-start px-4 py-3" onPress={() => setACancelar(r)}>
                  Cancelar requisición
                </Button>
              )}
            </View>
          );
        })
      )}

      <Prompt
        visible={!!aCancelar}
        onClose={() => setACancelar(null)}
        title="¿Cancelar esta requisición?"
        description="Farmacia dejará de verla. Sólo se puede cancelar lo que no se ha surtido."
        submitText="Cancelar requisición"
        cancelText="Conservar"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          if (!aCancelar) return;
          cancelar.mutate({ id: aCancelar.id, motivo: 'Cancelada desde el punto de venta' }, { onSettled: () => setACancelar(null) });
        }}
      />
    </Seccion>
  );
};

// ── Dar de baja ─────────────────────────────────────────────────────────────

const DarDeBaja: React.FC<{ almacenId?: string }> = ({ almacenId }) => {
  const lotes = useLotesDeAlmacen(almacenId);
  const baja = useBajaDeLote();
  const [lote, setLote] = React.useState<LoteDeAlmacen | null>(null);
  const [cantidad, setCantidad] = React.useState('1');
  const [motivo, setMotivo] = React.useState('');
  const [confirmando, setConfirmando] = React.useState(false);

  const n = Number(cantidad);
  const listo = !!lote && Number.isInteger(n) && n > 0 && n <= (lote?.quantity ?? 0) && motivo.trim().length >= 5;

  const ejecutar = () => {
    if (!lote) return;
    baja.mutate(
      { id: lote.id, quantity: n, reason: motivo.trim() },
      {
        onSuccess: (r) => {
          Toast.show({ type: 'success', text1: `Baja registrada: ${r.written_off} del lote ${r.batch_number}`, text2: 'Administración queda avisada.' });
          setLote(null);
          setCantidad('1');
          setMotivo('');
        },
        onSettled: () => setConfirmando(false),
      },
    );
  };

  return (
    <Seccion titulo="Dar de baja" descripcion="Lo que se rompió, se contaminó o no aparece. Sale del inventario con su motivo, y Administración recibe el aviso.">
      {!almacenId ? (
        <Text className="text-gray-400">No hay almacén de Enfermería configurado.</Text>
      ) : (lotes.data ?? []).length === 0 ? (
        <Text className="text-gray-400">No hay lotes con existencia en Enfermería.</Text>
      ) : (
        <View className="rounded-2xl border border-gray-200 bg-white">
          {(lotes.data ?? []).map((l) => (
            <Pressable
              key={l.id}
              onPress={() => setLote(lote?.id === l.id ? null : l)}
              className={clx('flex-row items-center justify-between border-b border-gray-100 px-4 py-3', lote?.id === l.id && 'bg-active-200')}
              accessibilityRole="button"
            >
              <View className="flex-1">
                <Text>Lote {l.batch_number}</Text>
                <Text className="text-sm text-gray-400">Caduca {new Date(l.expiration_date).toLocaleDateString('es-MX')}</Text>
              </View>
              <Text className="text-lg">{l.quantity}{l.sale_unit ? ` ${l.sale_unit}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {lote && (
        <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <Text>Lote {lote.batch_number} · {lote.quantity} disponibles</Text>
          <CampoConEtiqueta etiqueta="Cantidad que sale" value={cantidad} onChangeText={setCantidad} keyboardType="number-pad" placeholder="Cantidad" />
          <CampoConEtiqueta etiqueta="Motivo de la baja" value={motivo} onChangeText={setMotivo} placeholder="Motivo (obligatorio)" />
          <Button disabled={!listo} onPress={() => setConfirmando(true)}>
            Dar de baja
          </Button>
        </View>
      )}

      <Prompt
        visible={confirmando}
        onClose={() => setConfirmando(false)}
        title={`¿Dar de baja ${n} del lote ${lote?.batch_number ?? ''}?`}
        description={`Motivo: ${motivo.trim()}. Quedará en el kardex y Administración recibirá el aviso. No se puede deshacer.`}
        submitText="Dar de baja"
        cancelText="Volver"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={ejecutar}
      />
    </Seccion>
  );
};

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function AlmacenScreen() {
  const almacenes = useAlmacenes();
  const enfermeria = almacenes.data?.find((a) => a.area === 'nursing');

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-6 mt-8 text-4xl">Almacén de Enfermería</Text>
      <PedirAFarmacia />
      <MisRequisiciones />
      {enfermeria ? (
        <AltaDeLote
          almacenFijo={{ id: enfermeria.id, nombre: nombreDeAlmacen(enfermeria) }}
          conCosto={false}
          titulo="Dar de alta lo que llegó"
          descripcion="Lo que entra sin requisición: una compra directa, una donación o la carga inicial. Lo que pides a Farmacia se registra solo al confirmar que llegó."
        />
      ) : (
        <View className="mb-8">
          <Text className="text-2xl">Dar de alta lo que llegó</Text>
          <Text className="text-sm text-gray-400">No hay almacén de Enfermería configurado.</Text>
        </View>
      )}
      <DarDeBaja almacenId={enfermeria?.id} />
    </LayoutWithScroll>
  );
}
