import { ExistenciaDeVariante, PoliticaDeStock, useExistencias, useGuardarPolitica, useLotes, usePoliticasDeStock } from '@/api/hooks/almacen';
import { CampoConEtiqueta, Distintivo, sinVarianteUnica, ETIQUETA_LOTE, SelectorDeAlmacen, soloFecha, useAlmacenInicial } from '@/components/almacen/base';
import { InfoBanner } from '@/components/InfoBanner';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { contieneTexto } from '@/utils/buscar';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Existencias por almacén: cada presentación con sus unidades, sus lotes y
 * su mínimo. Al abrir una fila se ven los lotes (con caducidad y estado) y se
 * fija el mínimo y el máximo de esa presentación en ese almacén.
 *
 * Las unidades son de VENTA (tabletas, ampolletas), no de compra: es como se
 * lleva la existencia desde la fase 1.
 */

const MinimoYMaximo: React.FC<{ variantId: string; almacenId: string; politica?: PoliticaDeStock }> = ({ variantId, almacenId, politica }) => {
  const [minimo, setMinimo] = React.useState(politica ? String(politica.min_quantity) : '');
  const [maximo, setMaximo] = React.useState(politica?.max_quantity != null ? String(politica.max_quantity) : '');
  const guardar = useGuardarPolitica();

  React.useEffect(() => {
    setMinimo(politica ? String(politica.min_quantity) : '');
    setMaximo(politica?.max_quantity != null ? String(politica.max_quantity) : '');
  }, [politica]);

  const min = Number(minimo);
  const max = maximo.trim() === '' ? null : Number(maximo);
  const valido = Number.isInteger(min) && min >= 0 && (max === null || (Number.isInteger(max) && max >= min));

  return (
    <View className="gap-2">
      <Text className="text-sm text-gray-500">Mínimo y máximo en este almacén. Bajo el mínimo, el sistema avisa cada mañana.</Text>
      <View className="flex-row items-end gap-2">
        <CampoConEtiqueta etiqueta="Mínimo" className="flex-1" value={minimo} onChangeText={setMinimo} keyboardType="number-pad" placeholder="Mínimo" />
        <CampoConEtiqueta etiqueta="Máximo" className="flex-1" value={maximo} onChangeText={setMaximo} keyboardType="number-pad" placeholder="Máximo (opcional)" />
        <Button
          className="px-4"
          disabled={!valido || minimo.trim() === ''}
          isPending={guardar.isPending}
          onPress={() =>
            guardar.mutate(
              { variant_id: variantId, stock_location_id: almacenId, min_quantity: min, max_quantity: max },
              { onSuccess: () => Toast.show({ type: 'success', text1: 'Mínimo y máximo guardados' }) },
            )
          }
        >
          Guardar
        </Button>
      </View>
    </View>
  );
};

const Presentacion: React.FC<{ e: ExistenciaDeVariante; almacenId: string; politica?: PoliticaDeStock }> = ({ e, almacenId, politica }) => {
  const [abierta, setAbierta] = React.useState(false);
  const lotes = useLotes({ variant_id: e.variant_id, stock_location_id: almacenId }, abierta);
  const bajoMinimo = !!politica?.below_min;

  return (
    <View className={clx('rounded-2xl border bg-white', bajoMinimo ? 'border-error-300' : 'border-gray-200')}>
      <Pressable onPress={() => setAbierta((a) => !a)} accessibilityRole="button" accessibilityState={{ expanded: abierta }} className="flex-row items-center gap-3 p-4">
        <View className="flex-1 gap-1">
          <Text numberOfLines={2}>{e.title}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-xs text-gray-400">
              {e.batches} {e.batches === 1 ? 'lote' : 'lotes'}
              {e.quarantined_units > 0 ? ` · ${e.quarantined_units} en cuarentena` : ''}
              {politica ? ` · mín. ${politica.min_quantity}${politica.max_quantity != null ? ` / máx. ${politica.max_quantity}` : ''}` : ''}
            </Text>
            {bajoMinimo && <Distintivo tono="error">Bajo mínimo</Distintivo>}
          </View>
        </View>
        <Text className={clx('text-2xl', bajoMinimo ? 'text-error-500' : 'text-gray-900')}>{e.units}</Text>
      </Pressable>

      {abierta && (
        <View className="gap-4 border-t border-gray-100 p-4">
          <View className="gap-2">
            <Text className="text-sm text-gray-500">Lotes en este almacén, el que caduca antes primero.</Text>
            {lotes.isLoading ? (
              <Text className="text-gray-400">Cargando…</Text>
            ) : (lotes.data ?? []).filter((l) => l.status !== 'destroyed' && (Number(l.quantity) > 0 || l.status === 'quarantined')).length === 0 ? (
              <Text className="text-gray-400">Sin lotes.</Text>
            ) : (
              // Un lote activo en cero ya no cuenta como existencia; los de
              // cuarentena sí se enseñan aunque no vendan: hay que destruirlos.
              (lotes.data ?? [])
                .filter((l) => l.status !== 'destroyed' && (Number(l.quantity) > 0 || l.status === 'quarantined'))
                .map((l) => (
                  <View key={l.id} className="flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text>Lote {l.batch_number}</Text>
                      <Text className="text-xs text-gray-400">
                        Caduca {soloFecha(l.expiration_date)}{l.shelf_location ? ` · estante ${l.shelf_location}` : ''}
                      </Text>
                    </View>
                    {l.status !== 'active' && <Distintivo tono={ETIQUETA_LOTE[l.status].tono}>{ETIQUETA_LOTE[l.status].texto}</Distintivo>}
                    <Text className="text-lg">{l.quantity}{l.sale_unit ? ` ${l.sale_unit}` : ''}</Text>
                  </View>
                ))
            )}
          </View>
          <MinimoYMaximo variantId={e.variant_id} almacenId={almacenId} politica={politica} />
        </View>
      )}
    </View>
  );
};

export default function ExistenciasScreen() {
  const [almacenId, setAlmacenId] = useAlmacenInicial('pharmacy');
  const [busqueda, setBusqueda] = React.useState('');
  const existencias = useExistencias(almacenId);
  const politicas = usePoliticasDeStock(almacenId);

  const porVariante = React.useMemo(() => new Map((politicas.data?.stock_policies ?? []).map((p) => [p.variant_id, p])), [politicas.data]);

  const filas = React.useMemo(() => {
    // El valorizado etiqueta cada presentación como «Producto — Variante», y
    // en un catálogo de una sola presentación la variante se llama «Default»:
    // ruido para quien lee. Se quita sólo ese sufijo.
    const todas = (existencias.data?.items ?? []).map((e) => ({ ...e, title: sinVarianteUnica(e.title) }));
    const q = busqueda.trim();
    const lista = q ? todas.filter((e) => contieneTexto(e.title, q)) : todas;
    // Lo que está bajo mínimo, primero: es lo que hay que resolver hoy.
    return [...lista].sort((a, b) => Number(!!porVariante.get(b.variant_id)?.below_min) - Number(!!porVariante.get(a.variant_id)?.below_min) || a.title.localeCompare(b.title, 'es'));
  }, [existencias.data, busqueda, porVariante]);

  const bajoMinimo = politicas.data?.below_min ?? 0;
  const resumen = existencias.data?.summary;

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Existencias</Text>
      <Text className="mb-4 text-gray-400">Lo que hay en cada almacén, en unidades de venta. Abre una presentación para ver sus lotes y fijar su mínimo.</Text>

      <SelectorDeAlmacen valor={almacenId} onChange={setAlmacenId} />
      <SearchInput value={busqueda} onChangeText={setBusqueda} placeholder="Buscar medicamento…" className="my-3" />

      {bajoMinimo > 0 && (
        <InfoBanner colorScheme="error" className="mb-3">
          {bajoMinimo === 1 ? 'Una presentación está bajo su mínimo' : `${bajoMinimo} presentaciones están bajo su mínimo`}
        </InfoBanner>
      )}

      {resumen && (
        <Text className="mb-3 text-sm text-gray-400">
          {resumen.total_units} unidades en {resumen.total_batches} {resumen.total_batches === 1 ? 'lote' : 'lotes'}
        </Text>
      )}

      {existencias.isError ? (
        <Button variant="outline" className="self-center px-6" onPress={() => existencias.refetch()} isPending={existencias.isRefetching}>
          No se pudieron cargar las existencias. Reintentar
        </Button>
      ) : !almacenId || existencias.isLoading ? (
        <Text className="text-gray-400">Cargando…</Text>
      ) : filas.length === 0 ? (
        <Text className="mt-6 text-center text-gray-400">{busqueda ? 'Sin coincidencias' : 'Este almacén está vacío'}</Text>
      ) : (
        <View className="gap-2">
          {filas.map((e) => (
            <Presentacion key={e.variant_id} e={e} almacenId={almacenId} politica={porVariante.get(e.variant_id)} />
          ))}
        </View>
      )}
    </LayoutWithScroll>
  );
}
