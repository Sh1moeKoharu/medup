import {
  ConsultaDeReporte,
  DefinicionDeReporte,
  TablaDeReporte,
  TipoDeColumna,
  useDescargarReporte,
  useImprimirReporte,
  useTiposDeReporte,
  useVistaPreviaDeReporte,
} from '@/api/hooks/reportes';
import { CampoConEtiqueta, Chip, Chips, SelectorDeAlmacen } from '@/components/almacen/base';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ALL_ROLES, ROLE_LABELS } from '@/constants/roles';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

/**
 * Reportes para descargar en Excel o imprimir: la pantalla de Auditoría, de
 * RH y de Almacén. Cada perfil ve sólo los reportes que el servidor le deja
 * sacar (`GET /admin/reports/tipos`).
 *
 * Arriba se elige qué y de cuándo; abajo se ve una muestra de lo que saldrá,
 * para no descargar a ciegas. El archivo y la hoja los arma el servidor, así
 * que lo que se ve, lo que se descarga y lo que se imprime es lo mismo.
 */

const MUESTRA = 50;

type Rango = 'hoy' | 'ayer' | '7' | 'mes' | 'mes-pasado' | 'otro';

const RANGOS: { clave: Rango; texto: string }[] = [
  { clave: 'hoy', texto: 'Hoy' },
  { clave: 'ayer', texto: 'Ayer' },
  { clave: '7', texto: '7 días' },
  { clave: 'mes', texto: 'Este mes' },
  { clave: 'mes-pasado', texto: 'Mes pasado' },
  { clave: 'otro', texto: 'Otro periodo' },
];

/** "2026-09-14" en la hora del dispositivo, que es la de la clínica. */
const aDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function fechasDe(rango: Rango): { desde: string; hasta: string } | null {
  const hoy = new Date();
  const dia = (delta: number) => {
    const d = new Date(hoy);
    d.setDate(d.getDate() + delta);
    return aDia(d);
  };
  switch (rango) {
    case 'hoy':
      return { desde: dia(0), hasta: dia(0) };
    case 'ayer':
      return { desde: dia(-1), hasta: dia(-1) };
    case '7':
      return { desde: dia(-6), hasta: dia(0) };
    case 'mes':
      return { desde: aDia(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: dia(0) };
    case 'mes-pasado':
      return { desde: aDia(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: aDia(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
    default:
      return null;
  }
}

const esDia = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !Number.isNaN(new Date(`${v.trim()}T00:00:00`).getTime());

function celda(valor: unknown, tipo: TipoDeColumna = 'texto'): string {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (tipo) {
    case 'dinero':
      return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', currencyDisplay: 'narrowSymbol' }).format(Number(valor));
    case 'numero':
      return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(valor));
    case 'horas':
      return `${Number(valor).toFixed(2)} h`;
    case 'fecha':
    case 'fechahora': {
      // "2026-09-14" es un día, no un instante: leído como fecha sería la
      // medianoche UTC y en México saldría el 13.
      const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
      const d = soloDia ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3])) : new Date(String(valor));
      if (Number.isNaN(d.getTime())) return String(valor);
      return tipo === 'fecha'
        ? d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    }
    default:
      return String(valor);
  }
}

const numerica = (tipo?: TipoDeColumna) => tipo === 'numero' || tipo === 'dinero' || tipo === 'horas';
const anchoDe = (tipo?: TipoDeColumna) => (numerica(tipo) ? 'w-28' : tipo === 'fechahora' ? 'w-36' : tipo === 'fecha' ? 'w-28' : 'w-48');

/** La muestra: una tabla que se desplaza en horizontal dentro de su caja. */
const Muestra: React.FC<{ tabla: TablaDeReporte }> = ({ tabla }) => {
  const filas = tabla.filas.slice(0, MUESTRA);
  return (
    <View className="rounded-2xl border border-gray-200 bg-white">
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View className="flex-row border-b border-gray-300 px-3 py-2">
            {tabla.columnas.map((c) => (
              <Text key={c.clave} className={clx('px-2 text-xs text-gray-500', anchoDe(c.tipo), numerica(c.tipo) && 'text-right')}>
                {c.etiqueta}
              </Text>
            ))}
          </View>
          {filas.map((f, i) => (
            <View key={i} className="flex-row border-b border-gray-100 px-3 py-2">
              {tabla.columnas.map((c) => (
                <Text key={c.clave} numberOfLines={2} className={clx('px-2 text-sm', anchoDe(c.tipo), numerica(c.tipo) && 'text-right')}>
                  {celda(f[c.clave], c.tipo)}
                </Text>
              ))}
            </View>
          ))}
          {tabla.totales && tabla.filas.length > 0 && (
            <View className="flex-row px-3 py-2">
              {tabla.columnas.map((c, i) => (
                <Text key={c.clave} className={clx('px-2 text-sm font-semibold', anchoDe(c.tipo), numerica(c.tipo) && 'text-right')}>
                  {tabla.totales![c.clave] !== undefined ? celda(tabla.totales![c.clave], c.tipo) : i === 0 ? 'Total' : ''}
                </Text>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const Opcion: React.FC<{ r: DefinicionDeReporte; activa: boolean; onPress: () => void }> = ({ r, activa, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: activa }}
    className={clx('min-h-toque rounded-2xl border p-4 md:w-[31%]', activa ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white')}
  >
    <Text className={clx('text-base', activa && 'text-active-500')}>{r.etiqueta}</Text>
    <Text className="mt-1 text-sm text-gray-500">{r.descripcion}</Text>
  </Pressable>
);

export const Reportes: React.FC<{ descripcion?: string }> = ({ descripcion }) => {
  const tipos = useTiposDeReporte();
  const [tipo, setTipo] = React.useState<string | null>(null);
  const [rango, setRango] = React.useState<Rango>('7');
  const [desdeOtro, setDesdeOtro] = React.useState('');
  const [hastaOtro, setHastaOtro] = React.useState('');
  const [rol, setRol] = React.useState<string | null>(null);
  const [persona, setPersona] = React.useState('');
  const [almacen, setAlmacen] = React.useState<string | null>(null);
  const [agrupar, setAgrupar] = React.useState<string | null>(null);
  const personaBuscada = useDebouncedValue(persona, 400);

  const lista = tipos.data ?? [];
  const definicion = lista.find((r) => r.tipo === tipo) ?? lista[0] ?? null;
  const usa = (f: string) => !!definicion?.filtros.includes(f as never);

  const fechas = rango === 'otro' ? (esDia(desdeOtro) && esDia(hastaOtro) ? { desde: desdeOtro.trim(), hasta: hastaOtro.trim() } : null) : fechasDe(rango);
  const periodoIncompleto = usa('rango') && rango === 'otro' && !fechas;

  const consulta: ConsultaDeReporte | null =
    definicion && !periodoIncompleto
      ? {
          tipo: definicion.tipo,
          ...(usa('rango') && fechas ? fechas : {}),
          rol: usa('rol') ? rol ?? undefined : undefined,
          persona: usa('persona') ? personaBuscada : undefined,
          almacen: usa('almacen') ? almacen ?? undefined : undefined,
          agrupar: usa('agrupar') ? agrupar ?? definicion.agrupaciones?.[0]?.valor : undefined,
        }
      : null;

  const vista = useVistaPreviaDeReporte(consulta);
  const descargar = useDescargarReporte();
  const imprimir = useImprimirReporte();
  const tabla = vista.data;

  return (
    <View>
      <Text className="mb-1 mt-8 text-4xl">Reportes</Text>
      <Text className="mb-4 text-gray-400">{descripcion ?? 'Elige un reporte y un periodo. Revisa la muestra y descárgalo para Excel o imprímelo.'}</Text>

      {tipos.isError ? (
        <Button variant="outline" className="self-start px-6" onPress={() => tipos.refetch()} isPending={tipos.isRefetching}>
          No se pudieron cargar los reportes. Reintentar
        </Button>
      ) : tipos.isLoading ? (
        <Text className="text-gray-400">Cargando…</Text>
      ) : lista.length === 0 ? (
        <InfoBanner>Tu perfil no tiene reportes disponibles.</InfoBanner>
      ) : (
        <>
          <View className="mb-6 gap-2 md:flex-row md:flex-wrap">
            {lista.map((r) => (
              <Opcion
                key={r.tipo}
                r={r}
                activa={definicion?.tipo === r.tipo}
                onPress={() => {
                  setTipo(r.tipo);
                  setAgrupar(null);
                }}
              />
            ))}
          </View>

          {definicion && (
            <View className="mb-4 gap-3">
              {usa('rango') && (
                <View className="gap-2">
                  <Text className="text-xs text-gray-500">Periodo</Text>
                  <Chips>
                    {RANGOS.map((r) => (
                      <Chip key={r.clave} activo={rango === r.clave} onPress={() => setRango(r.clave)}>
                        {r.texto}
                      </Chip>
                    ))}
                  </Chips>
                  {rango === 'otro' && (
                    <View className="flex-row gap-2">
                      <CampoConEtiqueta etiqueta="Desde (AAAA-MM-DD)" className="flex-1" value={desdeOtro} onChangeText={setDesdeOtro} placeholder="2026-09-01" />
                      <CampoConEtiqueta etiqueta="Hasta (AAAA-MM-DD)" className="flex-1" value={hastaOtro} onChangeText={setHastaOtro} placeholder="2026-09-14" />
                    </View>
                  )}
                </View>
              )}

              {usa('agrupar') && definicion.agrupaciones && (
                <Chips>
                  {definicion.agrupaciones.map((a) => (
                    <Chip key={a.valor} activo={(agrupar ?? definicion.agrupaciones![0].valor) === a.valor} onPress={() => setAgrupar(a.valor)}>
                      {a.etiqueta}
                    </Chip>
                  ))}
                </Chips>
              )}

              {usa('rol') && (
                <Chips>
                  <Chip activo={rol === null} onPress={() => setRol(null)}>
                    Todos los perfiles
                  </Chip>
                  {ALL_ROLES.map((r) => (
                    <Chip key={r} activo={rol === r} onPress={() => setRol(r)}>
                      {ROLE_LABELS[r]}
                    </Chip>
                  ))}
                </Chips>
              )}

              {usa('persona') && (
                <CampoConEtiqueta etiqueta="Persona" value={persona} onChangeText={setPersona} placeholder="Usuario, nombre o número de empleado" autoCapitalize="none" />
              )}

              {usa('almacen') && <SelectorDeAlmacen valor={almacen} onChange={setAlmacen} todos />}
            </View>
          )}

          {periodoIncompleto && <InfoBanner className="mb-3">Escribe las dos fechas como 2026-09-14.</InfoBanner>}

          {Platform.OS === 'web' && consulta && (
            <View className="mb-4 flex-row flex-wrap gap-2">
              <Button className="px-5" onPress={() => descargar.mutate(consulta)} isPending={descargar.isPending} disabled={!tabla}>
                Descargar para Excel
              </Button>
              <Button variant="outline" className="px-5" onPress={() => imprimir.mutate(consulta)} isPending={imprimir.isPending} disabled={!tabla}>
                Imprimir
              </Button>
            </View>
          )}

          {vista.isError ? (
            <Button variant="outline" className="self-start px-6" onPress={() => vista.refetch()} isPending={vista.isRefetching}>
              No se pudo armar el reporte. Reintentar
            </Button>
          ) : !consulta ? null : vista.isLoading || !tabla ? (
            <Text className="text-gray-400">Armando el reporte…</Text>
          ) : (
            <View className="gap-2">
              <View>
                <Text className="text-xl">{tabla.titulo}</Text>
                <Text className="text-sm text-gray-500">
                  {tabla.subtitulo ? `${tabla.subtitulo} · ` : ''}
                  {tabla.filas.length} {tabla.filas.length === 1 ? 'registro' : 'registros'}
                  {tabla.filas.length > MUESTRA ? ` · se muestran los primeros ${MUESTRA}` : ''}
                </Text>
              </View>
              {tabla.filas.length === 0 ? <Text className="mt-4 text-center text-gray-400">Sin registros en este periodo</Text> : <Muestra tabla={tabla} />}
              {(tabla.notas ?? []).map((n) => (
                <Text key={n} className="text-xs text-gray-500">
                  {n}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};
