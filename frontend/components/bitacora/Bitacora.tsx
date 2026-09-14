import { AsientoBitacora, useBitacora } from '@/api/hooks/audit-logs';
import { Clock } from '@/components/icons/clock';
import { InfoBanner } from '@/components/InfoBanner';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { ALL_ROLES, ROLE_LABELS, roleLabel } from '@/constants/roles';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { isForbiddenError } from '@/utils/errors';
import { contieneTexto } from '@/utils/buscar';
import { aUsuario } from '@/utils/usuario';
import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

/**
 * La bitácora del sistema: quién hizo qué y cuándo.
 *
 * Es UNA pieza con dos casas: la pestaña «Actividad» de Administración en la
 * interfaz de Caja, y la pestaña «Bitácora» de Auditoría en la suya. Antes
 * vivía entera en la pantalla de Actividad; al darle interfaz a Auditoría se
 * saca aquí para no tener dos copias que se desincronicen.
 *
 * Lee la bitácora real del servidor, que va encadenada por huella digital
 * (ver `backend/src/lib/audit-chain.ts`). Fecha y perfil los filtra el
 * servidor; el texto se filtra aquí, sobre lo que llegó, porque describe
 * frases que sólo existen en esta pantalla.
 */

/**
 * Traduce el asiento —que es una llamada a la API— a una frase.
 *
 * Se traduce lo habitual y el resto se deja como viene. El punto final del
 * asiento se muestra SIEMPRE debajo: si esta tabla se queda corta con una ruta
 * nueva, no se oculta nada, sólo se lee peor.
 */
export function describir(asiento: AsientoBitacora): string {
  const { method, endpoint } = asiento;

  // No todo lo que llega en `endpoint` es una ruta: el servidor guarda ahi la
  // frase "Inicio de sesion" para los accesos (ver backend/src/api/middlewares.ts).
  // Eso ya es legible, asi que se usa tal cual en vez de anteponerle el metodo.
  if (!endpoint.startsWith('/')) {
    return endpoint;
  }

  const ruta = endpoint.split('?')[0];

  const reglas: [RegExp, string][] = [
    [/^\/admin\/medical-orders\/[^/]+\/dispense$/, 'Surtió una receta'],
    [/^\/admin\/medical-orders\/[^/]+\/consume$/, 'Aplicó una orden en consulta'],
    [/^\/admin\/medical-orders\/[^/]+\/items$/, 'Ajustó una orden médica'],
    [/^\/admin\/medical-orders\/[^/]+\/cancel$/, 'Canceló una receta'],
    [/^\/admin\/medical-orders$/, 'Emitió una receta'],
    [/^\/admin\/cash-sessions\/[^/]+\/close$/, 'Cerró la caja'],
    [/^\/admin\/cash-sessions\/[^/]+\/movements$/, 'Registró un movimiento de caja'],
    [/^\/admin\/cash-sessions$/, 'Abrió la caja'],
    [/^\/admin\/medical-batches\/[^/]+\/write-off$/, 'Dio de baja existencia de un lote'],
    [/^\/admin\/medical-batches\/[^/]+\/destroy$/, 'Destruyó un lote'],
    [/^\/admin\/medical-batches/, 'Modificó los lotes de inventario'],
    [/^\/admin\/stock-policies/, 'Cambió un mínimo o máximo de existencia'],
    [/^\/admin\/inventory-counts/, 'Hizo un inventario físico'],
    [/^\/admin\/staff\/[^/]+\/password$/, 'Cambió la contraseña de una cuenta'],
    [/^\/admin\/staff\/[^/]+\/block$/, 'Bloqueó una cuenta'],
    [/^\/admin\/staff\/[^/]+\/unblock$/, 'Reactivó una cuenta'],
    [/^\/admin\/staff\/[^/]+$/, method === 'DELETE' ? 'Dio de baja a un miembro del personal' : 'Modificó una cuenta de personal'],
    [/^\/admin\/staff$/, 'Dio de alta a un miembro del personal'],
    [/^\/admin\/customers/, method === 'DELETE' ? 'Dio de baja a un paciente' : 'Modificó la ficha de un paciente'],
    [/^\/admin\/draft-orders/, 'Trabajó sobre una venta en curso'],
    [/^\/admin\/orders/, 'Modificó un pedido'],
    [/^\/admin\/products/, 'Modificó el catálogo'],
    [/^\/admin\/receipt-config/, 'Cambió la configuración del ticket'],
    [/^\/admin\/b2b-agreements/, 'Modificó un convenio'],
    [/^\/admin\/medical-customers/, 'Consultó un expediente clínico'],
    [/^\/admin\/clinical-notes/, method === 'GET' ? 'Consultó notas de atención' : 'Escribió una nota de atención'],
    [/^\/admin\/documents\/nota/, 'Imprimió una nota de atención'],
    [/^\/admin\/requisitions\/[^/]+\/dispatch$/, 'Surtió una requisición'],
    [/^\/admin\/requisitions\/[^/]+\/receive$/, 'Recibió una requisición'],
    [/^\/admin\/requisitions\/[^/]+\/cancel$/, 'Canceló una requisición'],
    [/^\/admin\/requisitions/, 'Pidió una requisición'],
    [/^\/admin\/doctor-shifts\/[^/]+\/close$/, 'Cerró su turno médico'],
    [/^\/admin\/doctor-shifts/, 'Abrió su turno médico'],
    [/^\/admin\/doctor-commissions/, 'Fijó una comisión médica'],
  ];

  // Las lecturas se distinguen de las escrituras: mirar una ficha no la cambia.
  if (method === 'GET' && /^\/admin\/customers\//.test(ruta)) {
    return 'Consultó la ficha de un paciente';
  }

  const regla = reglas.find(([patron]) => patron.test(ruta));
  return regla ? regla[1] : `${method} ${ruta}`;
}

/** Color del punto según lo que se hizo, para poder barrer la lista con la vista. */
function colorDe(method: string): string {
  if (method === 'DELETE') return 'bg-error-500';
  if (method === 'POST') return 'bg-success-500';
  if (method === 'GET') return 'bg-gray-300';
  return 'bg-info-500';
}

const RANGOS = [
  { clave: 'hoy', texto: 'Hoy', dias: 0 },
  { clave: 'ayer', texto: 'Ayer', dias: 1 },
  { clave: '7', texto: '7 días', dias: 7 },
  { clave: '30', texto: '30 días', dias: 30 },
  { clave: 'todo', texto: 'Todo', dias: -1 },
] as const;

type ClaveDeRango = (typeof RANGOS)[number]['clave'];

/** Desde y hasta, en fecha local. «Ayer» es un solo día; los demás llegan hasta hoy. */
const rangoDe = (clave: ClaveDeRango): { from?: string; to?: string } => {
  const r = RANGOS.find((x) => x.clave === clave);
  if (!r || r.dias < 0) return {};
  const desde = new Date();
  desde.setDate(desde.getDate() - r.dias);
  const from = desde.toISOString().slice(0, 10);
  if (clave === 'ayer') return { from, to: from };
  return { from };
};

const Chip: React.FC<{ activo: boolean; onPress: () => void; children: string }> = ({ activo, onPress, children }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: activo }}
    className={`rounded-full border px-3 py-2 ${activo ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white'}`}
  >
    <Text className={`text-sm ${activo ? 'text-active-500' : 'text-gray-500'}`}>{children}</Text>
  </Pressable>
);

function fechaLegible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 24 horas a propósito: "06 sep, 14:29" ocupa bastante menos que
  // "06-sep, 02:29 p.m." —que se comía el borde derecho en un teléfono— y en un
  // registro clínico ahorra tener que fijarse en el a.m./p.m.
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const Asiento: React.FC<{ asiento: AsientoBitacora }> = ({ asiento }) => (
  <View className="flex-row items-start gap-4 border-b border-gray-100 py-4">
    <View className="mt-1 h-8 w-8 items-center justify-center rounded-full bg-gray-50">
      <Clock size={16} />
    </View>
    <View className="flex-1 gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="font-semibold" numberOfLines={1}>
          {aUsuario(asiento.user_email) || '— sin identificar —'}
        </Text>
        {!!asiento.user_role && (
          <View className="rounded bg-gray-100 px-1 py-0.5">
            <Text className="text-xs text-gray-500">{roleLabel(asiento.user_role)}</Text>
          </View>
        )}
        {!!asiento.user_employee_number && (
          <Text className="text-xs text-gray-500">Nº {asiento.user_employee_number}</Text>
        )}
      </View>
      <View className="flex-row items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${colorDe(asiento.method)}`} />
        <Text className="flex-1 text-gray-600">{describir(asiento)}</Text>
      </View>
      {/*
        La hora va aquí y no alineada a la derecha: la lista se dibuja unos
        píxeles más ancha que su contenedor —cosa de FlashList en web, se ve
        igual en Órdenes y en Pacientes— y lo que quede pegado al borde derecho
        se recorta. Con la hora al principio de la línea gris no hay nada en esa
        zona, y de paso el dato técnico queda junto al momento en que ocurrió.

        La línea del punto final sólo se añade cuando aporta: si el asiento ya
        traía una frase en vez de una ruta —los accesos—, repetirla no informa.
      */}
      <Text className="text-xs text-gray-300" numberOfLines={1}>
        {fechaLegible(asiento.created_at)}
        {asiento.endpoint.startsWith('/') ? ` · ${asiento.method} ${asiento.endpoint}` : ''}
      </Text>
    </View>
  </View>
);

/**
 * La bitácora completa: buscador, filtros y lista. Va dentro de un `Layout`
 * (ocupa el alto que le den) y da por hecho que quien la monta ya comprobó
 * que el rol puede leerla; si no, el servidor responde 403 y aquí se dice.
 */
export const Bitacora: React.FC<{ titulo: string; descripcion?: string }> = ({ titulo, descripcion }) => {
  const [busqueda, setBusqueda] = useState('');
  const [rango, setRango] = useState<ClaveDeRango>('7');
  const [perfil, setPerfil] = useState<string>('todos');
  const [limite, setLimite] = useState(50);

  const bitacora = useBitacora({
    ...rangoDe(rango),
    user_role: perfil === 'todos' ? undefined : perfil,
    limit: limite,
  });

  const asientos = useMemo(() => {
    const todos = bitacora.data?.asientos ?? [];
    const q = busqueda.trim();
    if (!q) return todos;
    // Sin acentos: la descripción se compone en español («Anuló una receta»),
    // y nadie escribe la tilde en un buscador.
    return todos.filter((a) =>
      [a.user_email, a.user_employee_number, a.user_role, a.endpoint, a.method, describir(a)]
        .filter(Boolean)
        .some((campo) => contieneTexto(String(campo), q)),
    );
  }, [bitacora.data, busqueda]);

  const cargados = bitacora.data?.asientos?.length ?? 0;
  const hayMas = (bitacora.data?.count ?? 0) > cargados;

  return (
    <>
      <Text className={descripcion ? 'mb-1 mt-8 text-4xl' : 'mt-8 mb-6 text-4xl'}>{titulo}</Text>
      {descripcion ? <Text className="mb-4 text-gray-400">{descripcion}</Text> : null}

      <SearchInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Filtrar por persona, número o acción..."
        className="mb-3"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 max-h-12" contentContainerClassName="gap-2">
        {RANGOS.map((r) => (
          <Chip key={r.clave} activo={rango === r.clave} onPress={() => { setLimite(50); setRango(r.clave); }}>{r.texto}</Chip>
        ))}
        <View className="w-2" />
        <Chip activo={perfil === 'todos'} onPress={() => { setLimite(50); setPerfil('todos'); }}>Todos</Chip>
        {ALL_ROLES.map((r) => (
          <Chip key={r} activo={perfil === r} onPress={() => { setLimite(50); setPerfil(r); }}>{ROLE_LABELS[r]}</Chip>
        ))}
      </ScrollView>

      {bitacora.isError ? (
        <View className="flex-1 items-center justify-center gap-2">
          <InfoBanner variant="ghost" colorScheme="error">
            {isForbiddenError(bitacora.error)
              ? 'Esta cuenta no puede consultar la bitácora'
              : 'No se pudo cargar la bitácora'}
          </InfoBanner>
          {!isForbiddenError(bitacora.error) && (
            <Button variant="outline" onPress={() => bitacora.refetch()} isPending={bitacora.isRefetching}>
              Reintentar
            </Button>
          )}
        </View>
      ) : !bitacora.isLoading && asientos.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-1">
          <Clock size={24} />
          <Text className="text-xl">{busqueda ? 'Sin coincidencias' : 'Todavía no hay actividad'}</Text>
          {/*
            El texto se filtra aquí, sobre lo que ya llegó. Decir sólo «sin
            coincidencias» haría creer que no existe, cuando puede estar más
            atrás: se dice sobre cuántos asientos se buscó y se deja traer más.
          */}
          <Text className="text-center text-gray-400">
            {busqueda
              ? `Ninguno de los ${cargados} asientos cargados coincide con la búsqueda`
              : 'Aquí aparecerá lo que el personal vaya haciendo en el sistema'}
          </Text>
          {busqueda && hayMas && (
            <Button variant="outline" className="mt-3 px-6" onPress={() => setLimite((l) => l + 50)} isPending={bitacora.isFetching}>
              Buscar en más asientos (hay {bitacora.data?.count} en este rango)
            </Button>
          )}
        </View>
      ) : (
        <FlashList
          data={asientos}
          renderItem={({ item }) => <Asiento asiento={item} />}
          keyExtractor={(item) => item.id}
          refreshing={bitacora.isRefetching}
          onRefresh={() => bitacora.refetch()}
          automaticallyAdjustKeyboardInsets
          contentContainerClassName="pb-2"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          ListFooterComponent={
            (bitacora.data?.count ?? 0) > asientos.length && !busqueda ? (
              <Button variant="outline" className="my-4 self-center px-6" onPress={() => setLimite((l) => l + 50)} isPending={bitacora.isFetching}>
                Cargar más ({asientos.length} de {bitacora.data?.count})
              </Button>
            ) : hayMas ? (
              <Button variant="outline" className="my-4 self-center px-6" onPress={() => setLimite((l) => l + 50)} isPending={bitacora.isFetching}>
                Buscar en más asientos (hay {bitacora.data?.count} en este rango)
              </Button>
            ) : null
          }
        />
      )}
    </>
  );
};
