import { FilaDeNomina, useNomina, useRegistrarPago } from '@/api/hooks/nomina';
import { CampoConEtiqueta, Distintivo } from '@/components/almacen/base';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { roleLabel } from '@/constants/roles';
import { formatearDinero } from '@/utils/dinero';
import * as React from 'react';
import { View } from 'react-native';

/**
 * Nómina del periodo, para RH: lo que toca pagar a cada persona según su
 * esquema (fijo por turno, por hora y comisión por horario), y el registro del
 * pago con su recibo. Los esquemas se definen en el panel, en «Honorarios y
 * nómina».
 */

const aDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Un día del periodo ("2026-09-01") tal cual, sin pasar por la zona del equipo.
const diaCorto = (d: string | undefined, iso: string) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    : new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
const quincena = () => {
  const hoy = new Date();
  const primera = hoy.getDate() <= 15;
  return {
    desde: aDia(new Date(hoy.getFullYear(), hoy.getMonth(), primera ? 1 : 16)),
    hasta: aDia(primera ? new Date(hoy.getFullYear(), hoy.getMonth(), 15) : new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  };
};

const Persona: React.FC<{ f: FilaDeNomina; desde: string; hasta: string }> = ({ f, desde, hasta }) => {
  const pagar = useRegistrarPago();
  const [confirmando, setConfirmando] = React.useState(false);
  const [referencia, setReferencia] = React.useState('');
  const d = f.desglose;
  const partes = [
    d.fijo ? `Fijo ${formatearDinero(d.fijo)} (${d.turnos} ${d.turnos === 1 ? 'turno' : 'turnos'})` : null,
    d.por_hora ? `Por hora ${formatearDinero(d.por_hora)} (${d.horas.toFixed(2)} h)` : null,
    ...d.por_regla.map((r) => `${r.percent}% de ${formatearDinero(r.base)}: ${formatearDinero(r.comision)}`),
  ].filter(Boolean);

  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg">{f.nombre}</Text>
          <Text className="text-sm text-gray-500">
            {roleLabel(f.rol)}
            {f.numero_empleado ? ` · Nº ${f.numero_empleado}` : ''}
          </Text>
        </View>
        <Text className="text-xl">{formatearDinero(d.total)}</Text>
      </View>
      {partes.length ? <Text className="text-sm text-gray-500">{partes.join(' · ')}</Text> : null}
      {!f.esquema && <Text className="text-sm text-error-500">Sin esquema de pago: defínelo en el panel.</Text>}
      {f.pagos.length ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Distintivo tono="exito">Pagado</Distintivo>
          <Text className="text-xs text-gray-500">
            {f.pagos
              .map((p) => `${formatearDinero(p.amount)} del ${diaCorto(p.dia_desde, p.period_from)} al ${diaCorto(p.dia_hasta, p.period_to)}`)
              .join(' · ')}
          </Text>
        </View>
      ) : confirmando ? (
        <View className="gap-2">
          <CampoConEtiqueta etiqueta="Referencia del pago (opcional)" value={referencia} onChangeText={setReferencia} placeholder="Transferencia, cheque…" />
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              isPending={pagar.isPending}
              onPress={() => pagar.mutate({ user_id: f.user_id, desde, hasta, reference: referencia.trim() || undefined }, { onSuccess: () => setConfirmando(false) })}
            >
              {`Pagar ${formatearDinero(d.total)}`}
            </Button>
          </View>
        </View>
      ) : (
        <Button variant="outline" className="self-start px-4" disabled={d.total <= 0} onPress={() => setConfirmando(true)}>
          Registrar pago
        </Button>
      )}
    </View>
  );
};

export default function NominaScreen() {
  const [periodo, setPeriodo] = React.useState(quincena());
  const nomina = useNomina(periodo.desde, periodo.hasta);
  const filas = nomina.data?.nomina ?? [];

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Nómina</Text>
      <Text className="mb-4 text-gray-400">Lo que toca pagar a cada persona en el periodo. Al registrar el pago sale su recibo; un periodo no se paga dos veces.</Text>

      <View className="mb-4 flex-row flex-wrap items-end gap-2">
        <CampoConEtiqueta etiqueta="Desde (AAAA-MM-DD)" className="min-w-[160px] flex-1" value={periodo.desde} onChangeText={(desde) => setPeriodo({ ...periodo, desde })} />
        <CampoConEtiqueta etiqueta="Hasta (AAAA-MM-DD)" className="min-w-[160px] flex-1" value={periodo.hasta} onChangeText={(hasta) => setPeriodo({ ...periodo, hasta })} />
        <Button variant="outline" className="px-4" onPress={() => setPeriodo(quincena())}>
          Quincena en curso
        </Button>
      </View>

      {nomina.data && <Text className="mb-3 text-lg">Total del periodo: {formatearDinero(nomina.data.total)}</Text>}

      {nomina.isError ? (
        <Button variant="outline" className="self-start px-6" onPress={() => nomina.refetch()} isPending={nomina.isRefetching}>
          No se pudo calcular la nómina. Reintentar
        </Button>
      ) : nomina.isLoading ? (
        <Text className="text-gray-400">Calculando…</Text>
      ) : filas.length === 0 ? (
        <Text className="mt-6 text-center text-gray-400">Nadie tiene turnos, atribuciones ni esquema en este periodo</Text>
      ) : (
        <View className="gap-3">
          {filas.map((f) => (
            <Persona key={f.user_id} f={f} desde={periodo.desde} hasta={periodo.hasta} />
          ))}
        </View>
      )}
    </LayoutWithScroll>
  );
}
