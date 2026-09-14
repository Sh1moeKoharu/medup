import { LoteProximo, Tramo, useCaducidades, useDescargarCaducidades } from '@/api/hooks/almacen';
import { Chip, Chips, Distintivo, SelectorDeAlmacen, sinVarianteUnica, soloFecha } from '@/components/almacen/base';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';

/**
 * Caducidades por tramo —caducado, 30, 60 y 90 días— con exportación a CSV.
 * La misma lista que el widget y la alerta diaria del panel
 * (backend/src/lib/caducidades.ts), así que los tres cuadran entre sí.
 */

const TRAMOS: { clave: 'todos' | Tramo; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'expired', texto: 'Caducados' },
  { clave: '30', texto: '≤ 30 días' },
  { clave: '60', texto: '31 a 60' },
  { clave: '90', texto: '61 a 90' },
];

const TONO: Record<Tramo, 'error' | 'aviso' | 'info' | 'gris'> = { expired: 'error', '30': 'aviso', '60': 'info', '90': 'gris' };
const ETIQUETA: Record<Tramo, string> = { expired: 'Caducado', '30': '30 días o menos', '60': '31 a 60 días', '90': '61 a 90 días' };

const Fila: React.FC<{ l: LoteProximo }> = ({ l }) => (
  <View className="gap-1 border-b border-gray-100 py-3">
    <View className="flex-row items-start justify-between gap-3">
      <Text className="flex-1" numberOfLines={2}>{sinVarianteUnica(l.title)}</Text>
      <Distintivo tono={TONO[l.tier]}>{l.tier === 'expired' ? `Caducó hace ${Math.abs(l.days_left)} d` : `${l.days_left} d`}</Distintivo>
    </View>
    <Text className="text-sm text-gray-500">
      Lote {l.batch_number} · caduca {soloFecha(l.expiration_date)} · {l.quantity} en existencia
    </Text>
    <Text className="text-xs text-gray-400">
      {l.stock_location_name ?? 'Sin almacén'}{l.shelf_location ? ` · estante ${l.shelf_location}` : ''}{l.status === 'quarantined' ? ' · en cuarentena' : ''}
    </Text>
  </View>
);

export const Caducidades: React.FC<{ titulo?: string; descripcion?: string }> = ({ titulo = 'Caducidades', descripcion }) => {
  const [almacenId, setAlmacenId] = React.useState<string | null>(null);
  const [tramo, setTramo] = React.useState<'todos' | Tramo>('todos');
  const caducidades = useCaducidades(almacenId);
  const descargar = useDescargarCaducidades();

  const items = (caducidades.data?.items ?? []).filter((l) => tramo === 'todos' || l.tier === tramo);
  const resumen = caducidades.data?.summary;

  return (
    <View>
      <Text className="mb-1 mt-8 text-4xl">{titulo}</Text>
      <Text className="mb-4 text-gray-400">{descripcion ?? 'Lo que caduca en los próximos 90 días, y lo que ya caducó y debe estar en cuarentena.'}</Text>

      <SelectorDeAlmacen valor={almacenId} onChange={setAlmacenId} todos />

      {resumen && (
        <View className="mb-2 mt-2 flex-row flex-wrap gap-2">
          {(['expired', '30', '60', '90'] as Tramo[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTramo(tramo === t ? 'todos' : t)}
              accessibilityRole="button"
              accessibilityState={{ selected: tramo === t }}
              className={clx('min-w-[45%] flex-1 rounded-xl p-3', tramo === t ? 'bg-active-200 border border-active-500' : 'bg-gray-50')}
            >
              <Text className="text-xs text-gray-400">{ETIQUETA[t]}</Text>
              <Text className={clx('text-lg', t === 'expired' && resumen[t].batches > 0 ? 'text-error-500' : 'text-gray-900')}>
                {resumen[t].batches} {resumen[t].batches === 1 ? 'lote' : 'lotes'} · {resumen[t].units} u.
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Chips>
        {TRAMOS.map((t) => (
          <Chip key={t.clave} activo={tramo === t.clave} onPress={() => setTramo(t.clave)}>{t.texto}</Chip>
        ))}
      </Chips>

      {Platform.OS === 'web' && (
        <Button
          variant="outline"
          className="my-3 self-start px-4 py-3"
          onPress={() => descargar.mutate({ stockLocationId: almacenId })}
          isPending={descargar.isPending}
        >
          Descargar CSV{almacenId ? ' de este almacén' : ' de los dos almacenes'}
        </Button>
      )}

      {caducidades.isError ? (
        <Button variant="outline" className="mt-4 self-center px-6" onPress={() => caducidades.refetch()} isPending={caducidades.isRefetching}>
          No se pudieron cargar las caducidades. Reintentar
        </Button>
      ) : !caducidades.isLoading && items.length === 0 ? (
        <Text className="mt-6 text-center text-gray-400">Nada caduca en este tramo</Text>
      ) : (
        <View>{items.map((l) => <Fila key={l.batch_id} l={l} />)}</View>
      )}
    </View>
  );
};
