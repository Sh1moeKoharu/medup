import { useAltaDeLote } from '@/api/hooks/almacen';
import { useProducts } from '@/api/hooks/products';
import { Campo, CampoConEtiqueta, Seccion, SelectorDeAlmacen, useAlmacenInicial } from '@/components/almacen/base';
import { Plus } from '@/components/icons/plus';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { clx } from '@/utils/clx';
import { formatearDinero } from '@/utils/dinero';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Alta de un lote, compartida por Almacén y por Enfermería.
 *
 * ── POR QUÉ ES UN COMPONENTE APARTE ─────────────────────────────────────────
 * Vivía dentro de la pantalla de Lotes de Almacén. Enfermería necesita dar de
 * alta lo que le llega a SU almacén (lo que no entra por requisición: una
 * compra directa, una donación, el arranque), y copiar el formulario habría
 * dejado dos versiones que se desincronizan. El servidor ya impedía que
 * Enfermería registrara en otro almacén que el suyo; lo que faltaba era la
 * pantalla.
 *
 * ── DOS DIFERENCIAS SEGÚN QUIÉN LO USA ──────────────────────────────────────
 * `almacenFijo`: Enfermería no elige almacén —siempre es el suyo— y se le
 * dice en lugar de ofrecerle un selector con una sola opción.
 *
 * `conCosto`: Enfermería no ve costos (ROLES_ALLOWED_TO_SEE_COST en el
 * servidor), así que ni se le piden ni se envían. El precio de venta lo sigue
 * fijando Almacén al comprar.
 */

type Presentacion = { variant_id: string; titulo: string; margen: number | null };

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const AltaDeLote: React.FC<{
  almacenFijo?: { id: string; nombre: string } | null;
  conCosto?: boolean;
  titulo?: string;
  descripcion?: string;
}> = ({ almacenFijo = null, conCosto = true, titulo = 'Alta de lote', descripcion = 'Como viene en la factura: cuántas unidades de compra y cuántas de venta trae cada una.' }) => {
  const [almacenElegido, setAlmacenElegido] = useAlmacenInicial('pharmacy');
  const almacenId = almacenFijo ? almacenFijo.id : almacenElegido;

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
  const costoNum = !conCosto || costo.trim() === '' ? null : Number(costo);
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
        ...(conCosto ? { unit_cost: costoNum ?? undefined, apply_margin: aplicarMargen } : {}),
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
    <Seccion titulo={titulo} descripcion={descripcion}>
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
                    const tituloPresentacion = (p.variants?.length ?? 0) > 1 ? `${p.title} — ${v.title}` : p.title;
                    const margenCrudo = (p.metadata as Record<string, unknown> | null | undefined)?.margen_automatico;
                    const margen = margenCrudo === undefined || margenCrudo === null || String(margenCrudo).trim() === '' ? null : Number(margenCrudo);
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => {
                          setPresentacion({ variant_id: v.id, titulo: tituloPresentacion, margen: margen !== null && Number.isFinite(margen) ? margen : null });
                          setBusqueda('');
                        }}
                        className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
                        accessibilityRole="button"
                        accessibilityLabel={`Elegir ${tituloPresentacion}`}
                      >
                        <Text className="flex-1" numberOfLines={2}>{tituloPresentacion}</Text>
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

          {almacenFijo ? (
            <Text className="text-sm text-gray-500">Entra a {almacenFijo.nombre}</Text>
          ) : (
            <>
              <Text className="text-sm text-gray-500">Almacén donde entra</Text>
              <SelectorDeAlmacen valor={almacenElegido} onChange={setAlmacenElegido} />
            </>
          )}

          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Número de lote" className="flex-1" value={lote} onChangeText={setLote} placeholder="Número de lote" autoCapitalize="characters" autoCorrect={false} />
            <CampoConEtiqueta etiqueta="Fecha de caducidad" className="flex-1" value={caducidad} onChangeText={setCaducidad} placeholder="Caduca (AAAA-MM-DD)" autoCorrect={false} />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Cantidad comprada" className="flex-1" value={comprada} onChangeText={setComprada} keyboardType="number-pad" placeholder="Cantidad comprada" />
            <CampoConEtiqueta etiqueta="Unidad de compra" className="flex-1" value={unidadCompra} onChangeText={setUnidadCompra} placeholder="Unidad de compra (caja)" />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Unidades de venta por unidad de compra" className="flex-1" value={factor} onChangeText={setFactor} keyboardType="number-pad" placeholder="Unidades por compra" />
            <CampoConEtiqueta etiqueta="Unidad de venta" className="flex-1" value={unidadVenta} onChangeText={setUnidadVenta} placeholder="Unidad de venta (tableta)" />
          </View>
          <View className="flex-row gap-2">
            <CampoConEtiqueta etiqueta="Fecha de compra" className="flex-1" value={fechaCompra} onChangeText={setFechaCompra} placeholder="Fecha de compra (AAAA-MM-DD)" autoCorrect={false} />
            {conCosto && (
              <CampoConEtiqueta etiqueta="Costo por unidad de compra" className="flex-1" value={costo} onChangeText={setCosto} keyboardType="decimal-pad" placeholder="Costo por unidad de compra" />
            )}
          </View>
          <CampoConEtiqueta etiqueta="Estante" value={estante} onChangeText={setEstante} placeholder="Estante (opcional)" />

          {conCosto && presentacion.margen !== null && costoNum !== null && (
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
