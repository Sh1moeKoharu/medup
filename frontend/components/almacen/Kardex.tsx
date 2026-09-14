import { Movimiento, useKardex } from '@/api/hooks/almacen';
import { useAlmacenes } from '@/api/hooks/requisiciones';
import { Chip, Chips, SelectorDeAlmacen, etiquetaDeMovimiento, fechaCorta, nombreDeAlmacen, sinVarianteUnica } from '@/components/almacen/base';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { contieneTexto } from '@/utils/buscar';
import { aUsuario } from '@/utils/usuario';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { View } from 'react-native';

/**
 * El kardex: cada movimiento de inventario, con su lote, su signo y quién lo
 * hizo. Lo miran Farmacia (para cuadrar su almacén) y Auditoría (para
 * revisar mermas y ajustes). Es de sólo lectura para todos: el libro mayor se
 * escribe desde el servidor y nunca a mano.
 *
 * Fecha, almacén y tipo los filtra el servidor; el texto se filtra aquí sobre
 * lo cargado, como en la bitácora.
 */

const RANGOS = [
  { clave: 'hoy', texto: 'Hoy', dias: 0 },
  { clave: '7', texto: '7 días', dias: 7 },
  { clave: '30', texto: '30 días', dias: 30 },
  { clave: 'todo', texto: 'Todo', dias: -1 },
] as const;

const SENTIDOS = [
  { clave: 'todos', texto: 'Todo' },
  { clave: 'entradas', texto: 'Entradas' },
  { clave: 'salidas', texto: 'Salidas' },
  { clave: 'mermas', texto: 'Mermas' },
] as const;

const desdeDe = (dias: number): string | undefined => {
  if (dias < 0) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
};

const esMerma = (m: Movimiento) => m.type === 'exit_expiry' || m.type === 'exit_damage';

const Fila: React.FC<{ m: Movimiento; almacen: string }> = ({ m, almacen }) => {
  const entrada = m.quantity_delta > 0;
  // El servidor completa el nombre al leer, pero si la presentación ya no está
  // en el catálogo no hay nombre que poner. El asiento no se oculta —es parte
  // del historial— y el id baja a la línea pequeña, donde sigue sirviendo para
  // rastrearlo sin ocupar el renglón que se lee de un vistazo.
  const sinNombre = !m.variant_title;
  return (
    <View className="gap-1 border-b border-gray-100 py-3">
      <View className="flex-row items-start justify-between gap-3">
        <Text className={clx('flex-1', sinNombre && 'text-gray-400')} numberOfLines={2}>
          {sinNombre ? 'Presentación retirada del catálogo' : sinVarianteUnica(m.variant_title!)}
        </Text>
        <Text className={clx('text-lg', entrada ? 'text-success-500' : esMerma(m) ? 'text-error-500' : 'text-gray-900')}>
          {entrada ? '+' : '−'}{Math.abs(m.quantity_delta)}
        </Text>
      </View>
      <Text className="text-sm text-gray-500">
        {etiquetaDeMovimiento(m.type)} · {almacen}{m.batch_number ? ` · lote ${m.batch_number}` : ''} · saldo {m.quantity_after}
      </Text>
      <Text className="text-xs text-gray-400" numberOfLines={2}>
        {fechaCorta(m.created_at)}{m.user_email ? ` · ${aUsuario(m.user_email)}` : ''}{m.reason ? ` · ${m.reason}` : ''}{sinNombre ? ` · ${m.variant_id}` : ''}
      </Text>
    </View>
  );
};

export const Kardex: React.FC<{ titulo?: string; descripcion?: string }> = ({ titulo = 'Kardex', descripcion }) => {
  const [almacenId, setAlmacenId] = React.useState<string | null>(null);
  const [rango, setRango] = React.useState<(typeof RANGOS)[number]['clave']>('7');
  const [sentido, setSentido] = React.useState<(typeof SENTIDOS)[number]['clave']>('todos');
  const [busqueda, setBusqueda] = React.useState('');
  const [limite, setLimite] = React.useState(100);

  const almacenes = useAlmacenes();
  const nombres = React.useMemo(() => new Map((almacenes.data ?? []).map((a) => [a.id, nombreDeAlmacen(a)])), [almacenes.data]);

  const kardex = useKardex({
    stock_location_id: almacenId ?? undefined,
    from: desdeDe(RANGOS.find((r) => r.clave === rango)?.dias ?? 7),
    limit: limite,
  });

  const filas = React.useMemo(() => {
    const todas = kardex.data?.movements ?? [];
    const q = busqueda.trim();
    return todas.filter((m) => {
      if (sentido === 'entradas' && m.quantity_delta <= 0) return false;
      if (sentido === 'salidas' && m.quantity_delta >= 0) return false;
      if (sentido === 'mermas' && !esMerma(m)) return false;
      if (!q) return true;
      return [m.variant_title, m.batch_number, m.user_email, m.reason, etiquetaDeMovimiento(m.type)]
        .filter(Boolean)
        .some((c) => contieneTexto(String(c), q));
    });
  }, [kardex.data, sentido, busqueda]);

  const resumen = kardex.data?.summary;

  return (
    <View className="flex-1">
      <Text className="mb-1 mt-8 text-4xl">{titulo}</Text>
      {descripcion ? <Text className="mb-4 text-gray-400">{descripcion}</Text> : <View className="mb-4" />}

      <SearchInput value={busqueda} onChangeText={setBusqueda} placeholder="Medicamento, lote, persona o motivo…" className="mb-2" />
      <SelectorDeAlmacen valor={almacenId} onChange={(id) => { setLimite(100); setAlmacenId(id); }} todos />
      <Chips>
        {RANGOS.map((r) => (
          <Chip key={r.clave} activo={rango === r.clave} onPress={() => { setLimite(100); setRango(r.clave); }}>{r.texto}</Chip>
        ))}
        <View className="w-2" />
        {SENTIDOS.map((s) => (
          <Chip key={s.clave} activo={sentido === s.clave} onPress={() => setSentido(s.clave)}>{s.texto}</Chip>
        ))}
      </Chips>

      {resumen && (
        <View className="mb-2 mt-2 flex-row gap-2">
          <View className="flex-1 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs text-gray-400">Entradas</Text>
            <Text className="text-lg text-success-500">+{resumen.total_entries}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs text-gray-400">Salidas</Text>
            <Text className="text-lg">−{resumen.total_exits}</Text>
          </View>
          <View className="flex-1 rounded-xl bg-gray-50 p-3">
            <Text className="text-xs text-gray-400">Mermas</Text>
            <Text className="text-lg text-error-500">−{resumen.total_shrinkage}</Text>
          </View>
        </View>
      )}

      {kardex.isError ? (
        <Button variant="outline" className="mt-4 self-center px-6" onPress={() => kardex.refetch()} isPending={kardex.isRefetching}>
          No se pudo cargar el kardex. Reintentar
        </Button>
      ) : !kardex.isLoading && filas.length === 0 ? (
        <Text className="mt-6 text-center text-gray-400">{busqueda ? 'Sin coincidencias' : 'Sin movimientos en este rango'}</Text>
      ) : (
        <View>
          {filas.map((m) => (
            <Fila key={m.id} m={m} almacen={nombres.get(m.stock_location_id ?? '') ?? 'Sin almacén'} />
          ))}
          {(kardex.data?.count ?? 0) >= limite && limite < 500 && (
            <Button variant="outline" className="my-4 self-center px-6" onPress={() => setLimite((l) => Math.min(500, l + 100))} isPending={kardex.isFetching}>
              Cargar más
            </Button>
          )}
        </View>
      )}
    </View>
  );
};
