import { CashSession, useCashSessions, useCashStats } from '@/api/hooks/cash-session';
import { useImprimirDocumento } from '@/api/hooks/clinica';
import { Chip, Chips, Distintivo, fechaCorta } from '@/components/almacen/base';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { formatearDinero } from '@/utils/dinero';
import * as React from 'react';
import { View } from 'react-native';

/**
 * Los cortes de caja, de sólo lectura, para Auditoría: cada turno cerrado con
 * su fondo, lo esperado, lo contado y la diferencia, y el corte impreso con
 * la misma aritmética que usó Caja. Debajo, el agregado por semana o por mes.
 *
 * No abre ni cierra turnos: eso es de Caja. El servidor lo impide de todas
 * formas (Auditoría no escribe), esto sólo evita enseñar botones que no van
 * a ninguna parte.
 */

const RANGOS = [
  { clave: '7', texto: '7 días', dias: 7 },
  { clave: '30', texto: '30 días', dias: 30 },
  { clave: '90', texto: '90 días', dias: 90 },
  { clave: 'todo', texto: 'Todo', dias: -1 },
] as const;

const desdeDe = (dias: number): string | undefined => {
  if (dias < 0) return undefined;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
};

/**
 * El agregado llega con la clave técnica del periodo («2026-09», «2026-W37»),
 * que no se lee. Como también trae desde y hasta, la etiqueta se compone aquí.
 * Las fechas vienen en UTC y marcan el inicio del periodo, así que se leen en
 * UTC: en hora local, «2026-09» empezaría el 31 de agosto.
 */
const etiquetaDePeriodo = (p: { periodo: string; desde?: string; hasta?: string }, grupo: 'week' | 'month'): string => {
  if (!p.desde) return p.periodo;
  const desde = new Date(p.desde);
  if (Number.isNaN(desde.getTime())) return p.periodo;
  if (grupo === 'month') {
    const mes = desde.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
  const hasta = p.hasta ? new Date(p.hasta) : null;
  const dia = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return hasta && !Number.isNaN(hasta.getTime()) ? `Semana del ${dia(desde)} al ${dia(hasta)}` : `Semana del ${dia(desde)}`;
};

const Corte: React.FC<{ s: CashSession; moneda?: string }> = ({ s, moneda }) => {
  const imprimir = useImprimirDocumento();
  const diferencia = Number(s.difference ?? 0);
  const cuadra = Math.abs(diferencia) < 0.005;
  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg" numberOfLines={1}>{s.cashier_name}</Text>
          <Text className="text-sm text-gray-400">
            {fechaCorta(s.opened_at)} → {s.closed_at ? fechaCorta(s.closed_at) : 'abierto'}
          </Text>
        </View>
        <Distintivo tono={cuadra ? 'exito' : diferencia > 0 ? 'info' : 'error'}>
          {cuadra ? 'Cuadró' : diferencia > 0 ? `Sobrante ${formatearDinero(diferencia, moneda)}` : `Faltante ${formatearDinero(Math.abs(diferencia), moneda)}`}
        </Distintivo>
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-sm text-gray-500">Fondo {formatearDinero(Number(s.opening_amount) || 0, moneda)}</Text>
        <Text className="text-sm text-gray-500">Esperado {formatearDinero(Number(s.expected_closing_amount) || 0, moneda)}</Text>
        <Text className="text-sm text-gray-500">Contado {formatearDinero(Number(s.actual_closing_amount) || 0, moneda)}</Text>
      </View>
      {s.notes ? <Text className="text-sm text-gray-400">«{s.notes}»</Text> : null}
      <Button variant="outline" className="self-start px-4 py-3" onPress={() => imprimir.mutate({ tipo: 'corte', id: s.id })} isPending={imprimir.isPending}>
        Imprimir corte
      </Button>
    </View>
  );
};

export const CortesDeCaja: React.FC = () => {
  const settings = useSettings();
  const moneda = settings.data?.region?.currency_code;
  const [rango, setRango] = React.useState<(typeof RANGOS)[number]['clave']>('30');
  const [grupo, setGrupo] = React.useState<'week' | 'month'>('week');
  const from = desdeDe(RANGOS.find((r) => r.clave === rango)?.dias ?? 30);

  const cortes = useCashSessions({ status: 'closed', limit: 50, from });
  const stats = useCashStats({ from, group: grupo });

  return (
    <View>
      <Text className="mb-1 mt-8 text-4xl">Cortes de caja</Text>
      <Text className="mb-4 text-gray-400">Cada turno cerrado, con lo esperado y lo contado. Sólo lectura: los turnos los abre y cierra Caja.</Text>

      <Chips>
        {RANGOS.map((r) => (
          <Chip key={r.clave} activo={rango === r.clave} onPress={() => setRango(r.clave)}>{r.texto}</Chip>
        ))}
      </Chips>

      <View className="mb-8 mt-3 gap-3">
        {cortes.isError ? (
          <Button variant="outline" className="self-center px-6" onPress={() => cortes.refetch()} isPending={cortes.isRefetching}>
            No se pudieron cargar los cortes. Reintentar
          </Button>
        ) : !cortes.isLoading && (cortes.data ?? []).length === 0 ? (
          <Text className="text-center text-gray-400">Sin cortes en este rango</Text>
        ) : (
          (cortes.data ?? []).map((s) => <Corte key={s.id} s={s} moneda={moneda} />)
        )}
      </View>

      <Text className="mb-1 text-2xl">Por periodo</Text>
      <Text className="mb-2 text-sm text-gray-400">Ventas de los turnos cerrados del rango, agrupadas.</Text>
      <Chips>
        <Chip activo={grupo === 'week'} onPress={() => setGrupo('week')}>Por semana</Chip>
        <Chip activo={grupo === 'month'} onPress={() => setGrupo('month')}>Por mes</Chip>
      </Chips>
      <View className="mt-3 gap-2 pb-10">
        {(stats.data?.periods ?? []).length === 0 ? (
          <Text className="text-gray-400">{stats.isLoading ? 'Cargando…' : 'Sin turnos cerrados en el rango'}</Text>
        ) : (
          stats.data!.periods.map((p) => (
            <View key={p.periodo} className="gap-1 rounded-xl bg-gray-50 p-3">
              <View className="flex-row items-center justify-between">
                <Text>{etiquetaDePeriodo(p, grupo)}</Text>
                <Text className="text-lg">{formatearDinero(p.sales_total, moneda)}</Text>
              </View>
              <Text className="text-xs text-gray-400">
                {p.sesiones} {p.sesiones === 1 ? 'turno' : 'turnos'} · efectivo {formatearDinero(p.sales_cash, moneda)} · tarjeta {formatearDinero(p.sales_card, moneda)} · transferencia {formatearDinero(p.sales_transfer, moneda)}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
};
