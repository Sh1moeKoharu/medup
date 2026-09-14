import { Lote, useAltaDeLote, useBajaDeLoteConTipo, useDestruirLote, useLotes } from '@/api/hooks/almacen';
import { useProducts } from '@/api/hooks/products';
import { useAlmacenes } from '@/api/hooks/requisiciones';
import { Campo, CampoConEtiqueta, Chip, Chips, Distintivo, ETIQUETA_LOTE, Seccion, SelectorDeAlmacen, nombreDeAlmacen, soloFecha, useAlmacenInicial } from '@/components/almacen/base';
import { Plus } from '@/components/icons/plus';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatearDinero } from '@/utils/dinero';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Lotes: el alta con los datos de la compra, y lo que se hace con un lote ya
 * registrado —darlo de baja con motivo, o destruirlo si está en cuarentena—.
 *
 * ── EL ALTA ─────────────────────────────────────────────────────────────────
 * Se captura como viene en la factura: cuántas unidades de compra (cajas) y
 * cuántas unidades de venta (tabletas) trae cada una. La existencia se lleva
 * en unidades de venta. Si el producto tiene margen automático y se da el
 * costo, el precio de venta se recalcula y se enseña ANTES de guardar.
 *
 * ── LA DESTRUCCIÓN ──────────────────────────────────────────────────────────
 * Sólo de lotes en cuarentena (los que caducaron y el sistema bloqueó), con
 * motivo y reconfirmando la contraseña: es irreversible.
 */

type Presentacion = { variant_id: string; titulo: string; margen: number | null };

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Campo del alta con su etiqueta ENCIMA. Con sólo el marcador de posición, al
 * escribir desaparecía y nueve casillas llenas no decían cuál era cuál (se
 * vio en el manual de Farmacia).
 */
const AltaDeLote: React.FC = () => {
  const [almacenId, setAlmacenId] = useAlmacenInicial('pharmacy');
  const [busqueda, setBusqueda] = React.useState('');
  const termino = useDebouncedValue(busqueda, 300);
  const productos = useProducts(termino.trim().length >= 2 ? { q: termino.trim() } : undefined, 8, { enabled: termino.trim().length >= 2 });
  const [presentacion, setPresentacion] = React.useState<Presentacion | null>(null);

  const [lote, setLote] = React.useState('');
  const [caducidad, setCaducidad] = React.useState('');
  const [comprada, setComprada] = React.useState('1');
  const [factor, setFactor] = React.useState('1');
  const [unidadCompra, setUnidadCompra] = React.useState('');
  const [unidadVenta, setUnidadVenta] = React.useState('');
  const [fechaCompra, setFechaCompra] = React.useState('');
  const [costo, setCosto] = React.useState('');
  const [aplicarMargen, setAplicarMargen] = React.useState(true);
  const [estante, setEstante] = React.useState('');
  const alta = useAltaDeLote();

  const resultados = productos.data?.pages?.[0]?.products ?? [];

  const compradaNum = Number(comprada);
  const factorNum = Number(factor);
  const costoNum = costo.trim() === '' ? null : Number(costo);
  const unidades = Number.isInteger(compradaNum) && compradaNum > 0 && Number.isInteger(factorNum) && factorNum > 0 ? compradaNum * factorNum : null;
  const costoVenta = costoNum !== null && Number.isFinite(costoNum) && costoNum >= 0 && factorNum > 0 ? costoNum / factorNum : null;
  const precioPrevisto =
    aplicarMargen && costoVenta !== null && presentacion?.margen != null ? redondear2(costoVenta * (1 + presentacion.margen / 100)) : null;
  const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(caducidad.trim()) && !Number.isNaN(new Date(caducidad.trim()).getTime());
  const listo = !!presentacion && !!almacenId && lote.trim().length > 0 && fechaValida && unidades !== null;

  const limpiar = () => {
    setPresentacion(null);
    setLote('');
    setCaducidad('');
    setComprada('1');
    setFactor('1');
    setUnidadCompra('');
    setUnidadVenta('');
    setFechaCompra('');
    setCosto('');
    setEstante('');
  };

  const guardar = () => {
    if (!presentacion || !almacenId) return;
    alta.mutate(
      {
        variant_id: presentacion.variant_id,
        stock_location_id: almacenId,
        batch_number: lote.trim(),
        expiration_date: new Date(caducidad.trim()).toISOString(),
        purchase_quantity: compradaNum,
        units_per_purchase: factorNum,
        purchase_unit: unidadCompra.trim() || undefined,
        sale_unit: unidadVenta.trim() || undefined,
        purchase_date: fechaCompra.trim() ? new Date(fechaCompra.trim()).toISOString() : undefined,
        unit_cost: costoNum ?? undefined,
        apply_margin: aplicarMargen,
        shelf_location: estante.trim() || undefined,
      },
      {
        onSuccess: (r) => {
          Toast.show({
            type: 'success',
            text1: `Lote ${r.batch.batch_number} registrado: ${r.batch.quantity} unidades`,
            text2: r.precio ? `Precio de venta: ${formatearDinero(r.precio.nuevo, r.precio.currency_code)}` : r.advertencia,
          });
          limpiar();
        },
      },
    );
  };

  return (
    <Seccion titulo="Alta de lote" descripcion="Como viene en la factura: cuántas unidades de compra y cuántas de venta trae cada una.">
      {!presentacion ? (
        <>
          <Campo value={busqueda} onChangeText={setBusqueda} placeholder="Buscar medicamento" autoCorrect={false} />
          {termino.trim().length >= 2 && (
            <View className="rounded-2xl border border-gray-200 bg-white">
              {productos.isLoading ? (
                <Text className="p-4 text-gray-400">Buscando…</Text>
              ) : resultados.length === 0 ? (
                <Text className="p-4 text-gray-400">Sin resultados para «{termino}»</Text>
              ) : (
                resultados.flatMap((p) =>
                  (p.variants ?? []).map((v) => {
                    const titulo = (p.variants?.length ?? 0) > 1 ? `${p.title} — ${v.title}` : p.title;
                    const margenCrudo = (p.metadata as Record<string, unknown> | null | undefined)?.margen_automatico;
                    const margen = margenCrudo === undefined || margenCrudo === null || String(margenCrudo).trim() === '' ? null : Number(margenCrudo);
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          setPresentacion({ variant_id: v.id, titulo, margen: margen !== null && Number.isFinite(margen) ? margen : null });
                          setBusqueda('');
                        }}
                        className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
                        accessibilityRole="button"
                        accessibilityLabel={`Elegir ${titulo}`}
                      >
                        <Text className="flex-1" numberOfLines={2}>{titulo}</Text>
                        <Plus size={18} className="text-gray-500" />
                      </Pressable>
                    );
                  }),
                )
              )}
            </View>
          )}
        </>
      ) : (
        <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 text-lg" numberOfLines={2}>{presentacion.titulo}</Text>
            <Button variant="outline" className="px-3 py-2" onPress={limpiar}>Cambiar</Button>
          </View>
          <Text className="text-sm text-gray-500">Almacén donde entra</Text>
          <SelectorDeAlmacen valor={almacenId} onChange={setAlmacenId} />
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Número de lote" className="flex-1" value={lote} onChangeText={setLote} placeholder="Número de lote" autoCapitalize="characters" autoCorrect={false}  />
            <CampoConEtiqueta etiqueta="Fecha de caducidad" className="flex-1" value={caducidad} onChangeText={setCaducidad} placeholder="Caduca (AAAA-MM-DD)" autoCorrect={false}  />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Cantidad comprada" className="flex-1" value={comprada} onChangeText={setComprada} keyboardType="number-pad" placeholder="Cantidad comprada"  />
            <CampoConEtiqueta etiqueta="Unidad de compra" className="flex-1" value={unidadCompra} onChangeText={setUnidadCompra} placeholder="Unidad de compra (caja)"  />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Unidades de venta por unidad de compra" className="flex-1" value={factor} onChangeText={setFactor} keyboardType="number-pad" placeholder="Unidades por compra"  />
            <CampoConEtiqueta etiqueta="Unidad de venta" className="flex-1" value={unidadVenta} onChangeText={setUnidadVenta} placeholder="Unidad de venta (tableta)"  />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Fecha de compra" className="flex-1" value={fechaCompra} onChangeText={setFechaCompra} placeholder="Fecha de compra (AAAA-MM-DD)" autoCorrect={false}  />
            <CampoConEtiqueta etiqueta="Costo por unidad de compra" className="flex-1" value={costo} onChangeText={setCosto} keyboardType="decimal-pad" placeholder="Costo por unidad de compra"  />
          </View>
          <CampoConEtiqueta etiqueta="Estante" value={estante} onChangeText={setEstante} placeholder="Estante (opcional)"  />

          {presentacion.margen !== null && costoNum !== null && (
            <Pressable onPress={() => setAplicarMargen((a) => !a)} accessibilityRole="checkbox" accessibilityState={{ checked: aplicarMargen }} className="flex-row items-center gap-3">
              <View className={clx('h-6 w-6 items-center justify-center rounded-md border', aplicarMargen ? 'border-active-500 bg-active-500' : 'border-gray-300 bg-white')}>
                {aplicarMargen && <Text className="text-xs text-white">✓</Text>}
              </View>
              <Text className="flex-1 text-sm text-gray-600">Aplicar el margen del producto ({presentacion.margen} %) al precio de venta</Text>
            </Pressable>
          )}

          <View className="rounded-xl bg-gray-50 p-3">
            <Text className="text-sm text-gray-600">
              {unidades !== null ? `Entran ${unidades} unidades de venta${unidadVenta.trim() ? ` (${unidadVenta.trim()})` : ''}` : 'Cantidad y factor deben ser enteros mayores que cero.'}
              {costoVenta !== null ? ` · costo ${formatearDinero(redondear2(costoVenta))} por unidad de venta` : ''}
              {precioPrevisto !== null ? ` · el precio de venta quedará en ${formatearDinero(precioPrevisto)}` : ''}
              {costoNum !== null && presentacion.margen === null ? ' · sin margen automático: el precio de venta no cambia' : ''}
            </Text>
          </View>

          <Button disabled={!listo} isPending={alta.isPending} onPress={guardar}>
            Registrar lote
          </Button>
        </View>
      )}
    </Seccion>
  );
};

const ESTADOS: { clave: 'active' | 'quarantined' | 'todos'; texto: string }[] = [
  { clave: 'active', texto: 'Activos' },
  { clave: 'quarantined', texto: 'En cuarentena' },
  { clave: 'todos', texto: 'Todos' },
];

const LotesDelAlmacen: React.FC = () => {
  const [almacenId, setAlmacenId] = useAlmacenInicial('pharmacy');
  const [estado, setEstado] = React.useState<'active' | 'quarantined' | 'todos'>('active');
  const lotes = useLotes({ stock_location_id: almacenId ?? undefined, status: estado === 'todos' ? undefined : estado }, !!almacenId);
  const almacenes = useAlmacenes();
  const almacen = almacenes.data?.find((a) => a.id === almacenId);

  const [elegido, setElegido] = React.useState<Lote | null>(null);
  const [cantidad, setCantidad] = React.useState('1');
  const [motivo, setMotivo] = React.useState('');
  const [tipo, setTipo] = React.useState<'exit_damage' | 'exit_adjustment'>('exit_damage');
  const [clave, setClave] = React.useState('');
  const [confirmando, setConfirmando] = React.useState<'baja' | 'destruccion' | null>(null);
  const baja = useBajaDeLoteConTipo();
  const destruir = useDestruirLote();

  // Un lote activo en cero no tiene nada que dar de baja; se enseña sólo si
  // se pide «Todos». Los de cuarentena van siempre: hay que destruirlos.
  const lista = (lotes.data ?? []).filter((l) => l.status !== 'destroyed' && (estado === 'todos' || Number(l.quantity) > 0 || l.status === 'quarantined'));
  const n = Number(cantidad);
  const bajaLista = !!elegido && Number.isInteger(n) && n > 0 && n <= elegido.quantity && motivo.trim().length >= 5;
  const destruccionLista = !!elegido && elegido.status === 'quarantined' && motivo.trim().length >= 5 && clave.length > 0;

  const cerrar = () => {
    setElegido(null);
    setCantidad('1');
    setMotivo('');
    setClave('');
    setConfirmando(null);
  };

  return (
    <Seccion titulo="Lotes del almacén" descripcion="Toca un lote para darlo de baja con motivo, o destruirlo si está en cuarentena.">
      <SelectorDeAlmacen valor={almacenId} onChange={(id) => { setAlmacenId(id); setElegido(null); }} />
      <Chips>
        {ESTADOS.map((e) => (
          <Chip key={e.clave} activo={estado === e.clave} onPress={() => { setEstado(e.clave); setElegido(null); }}>{e.texto}</Chip>
        ))}
      </Chips>

      {lotes.isError ? (
        <Button variant="outline" onPress={() => lotes.refetch()} isPending={lotes.isRefetching}>
          No se pudieron cargar los lotes. Reintentar
        </Button>
      ) : lista.length === 0 ? (
        <Text className="text-gray-400">{lotes.isLoading ? 'Cargando…' : `Sin lotes ${estado === 'quarantined' ? 'en cuarentena' : ''} en ${nombreDeAlmacen(almacen)}.`}</Text>
      ) : (
        <View className="rounded-2xl border border-gray-200 bg-white">
          {lista.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => { setElegido(elegido?.id === l.id ? null : l); setCantidad('1'); setMotivo(''); setClave(''); }}
              className={clx('flex-row items-center gap-3 border-b border-gray-100 px-4 py-3', elegido?.id === l.id && 'bg-active-200')}
              accessibilityRole="button"
            >
              <View className="flex-1">
                <Text>Lote {l.batch_number}</Text>
                <Text className="text-sm text-gray-400">
                  Caduca {soloFecha(l.expiration_date)}{l.purchase_date ? ` · comprado ${soloFecha(l.purchase_date)}` : ''}{l.shelf_location ? ` · estante ${l.shelf_location}` : ''}
                </Text>
              </View>
              {l.status !== 'active' && <Distintivo tono={ETIQUETA_LOTE[l.status].tono}>{ETIQUETA_LOTE[l.status].texto}</Distintivo>}
              <Text className="text-lg">{l.quantity}{l.sale_unit ? ` ${l.sale_unit}` : ''}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {elegido && (
        <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <Text>Lote {elegido.batch_number} · {elegido.quantity} disponibles · {ETIQUETA_LOTE[elegido.status].texto}</Text>

          {elegido.status === 'quarantined' ? (
            <>
              <Text className="text-sm text-gray-500">Está en cuarentena: la existencia completa se destruye y se asienta la salida. Es irreversible; por eso se pide la contraseña.</Text>
              <CampoConEtiqueta etiqueta="Motivo de la destrucción" value={motivo} onChangeText={setMotivo} placeholder="Motivo (obligatorio, 5 letras o más)" />
              <CampoConEtiqueta etiqueta="Tu contraseña" value={clave} onChangeText={setClave} placeholder="Tu contraseña" secureTextEntry autoCapitalize="none" autoCorrect={false} />
              <Button variant="danger" disabled={!destruccionLista} onPress={() => setConfirmando('destruccion')}>
                Destruir lote
              </Button>
            </>
          ) : (
            <>
              <Chips>
                <Chip activo={tipo === 'exit_damage'} onPress={() => setTipo('exit_damage')}>Daño, rotura o robo</Chip>
                <Chip activo={tipo === 'exit_adjustment'} onPress={() => setTipo('exit_adjustment')}>Ajuste de inventario</Chip>
              </Chips>
              <CampoConEtiqueta etiqueta="Cantidad que sale" value={cantidad} onChangeText={setCantidad} keyboardType="number-pad" placeholder="Cantidad" />
              <CampoConEtiqueta etiqueta="Motivo de la baja" value={motivo} onChangeText={setMotivo} placeholder="Motivo (obligatorio, 5 letras o más)" />
              <Button disabled={!bajaLista} onPress={() => setConfirmando('baja')}>
                Dar de baja
              </Button>
            </>
          )}
        </View>
      )}

      <Prompt
        visible={confirmando === 'baja'}
        onClose={() => setConfirmando(null)}
        title={`¿Dar de baja ${n} del lote ${elegido?.batch_number ?? ''}?`}
        description={`Motivo: ${motivo.trim()}. Quedará en el kardex y Administración recibirá el aviso. No se puede deshacer.`}
        submitText="Dar de baja"
        cancelText="Volver"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          if (!elegido) return;
          baja.mutate(
            { id: elegido.id, quantity: n, reason: motivo.trim(), type: tipo },
            {
              onSuccess: (r) => {
                Toast.show({ type: 'success', text1: `Baja registrada: ${r.written_off} del lote ${r.batch_number}`, text2: `Quedan ${r.quantity_after}. Administración queda avisada.` });
                cerrar();
              },
              onSettled: () => setConfirmando(null),
            },
          );
        }}
      />
      <Prompt
        visible={confirmando === 'destruccion'}
        onClose={() => setConfirmando(null)}
        title={`¿Destruir el lote ${elegido?.batch_number ?? ''}?`}
        description={`Se destruyen ${elegido?.quantity ?? 0} unidades. Motivo: ${motivo.trim()}. Queda asentado con tu nombre. No se puede deshacer.`}
        submitText="Destruir"
        cancelText="Volver"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          if (!elegido) return;
          destruir.mutate(
            { id: elegido.id, reason: motivo.trim(), password: clave },
            {
              onSuccess: (r) => {
                Toast.show({ type: 'success', text1: `Lote ${r.batch_number} destruido: ${r.destroyed_quantity} unidades`, text2: `Autorizó ${r.authorized_by}` });
                cerrar();
              },
              onSettled: () => setConfirmando(null),
            },
          );
        }}
      />
    </Seccion>
  );
};

export default function LotesScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-6 mt-8 text-4xl">Lotes</Text>
      <AltaDeLote />
      <LotesDelAlmacen />
    </LayoutWithScroll>
  );
}
