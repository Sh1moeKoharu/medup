import type { ExistenciaPorArea } from '@/api/hooks/clinica';
import type { AjusteDeOrden } from '@/api/hooks/medical-orders';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { roleLabel } from '@/constants/roles';
import { color } from '@/theme/tokens';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { TextInput, View } from 'react-native';

/**
 * Piezas para ajustar lo que recetó el médico, compartidas por la bandeja de
 * Enfermería y las recetas de Farmacia.
 */

/** Espejo de LARGO_MINIMO_MOTIVO en backend/src/lib/ajustes-de-orden.ts. */
export const LARGO_MINIMO_MOTIVO = 20;

const limpiar = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Quitar o reducir con motivo, DENTRO de la tarjeta y no en un cuadro aparte.
 *
 * Un campo de texto dentro de un Dialog no recibe el foco en web (el atrapador
 * de foco del Modal pelea con el de la navegación; ver components/ui/Dialog.tsx),
 * así que el motivo se escribe aquí mismo, bajo el renglón que se va a cambiar.
 */
export const MotivoDeAjuste: React.FC<{
  descripcion: string;
  enviando?: boolean;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}> = ({ descripcion, enviando, onConfirmar, onCancelar }) => {
  const [motivo, setMotivo] = React.useState('');
  const largo = limpiar(motivo).length;
  const listo = largo >= LARGO_MINIMO_MOTIVO;
  return (
    <View className="gap-2 rounded-xl border border-warning-300 bg-warning-200 p-3">
      <Text className="text-sm">{descripcion}</Text>
      <TextInput
        value={motivo}
        onChangeText={setMotivo}
        placeholder="Por qué se quita o se reduce: queda en el registro de la receta"
        placeholderTextColor={color.textoTerciario}
        multiline
        autoFocus
        spellCheck={false}
        accessibilityLabel="Motivo del ajuste"
        className="min-h-[64px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base"
      />
      <View className="flex-row items-center gap-2">
        <Text className={clx('flex-1 text-xs', listo ? 'text-success-500' : 'text-gray-500')}>
          {listo ? 'Motivo suficiente' : `${largo} de ${LARGO_MINIMO_MOTIVO} caracteres como mínimo`}
        </Text>
        <Button variant="outline" className="px-4" onPress={onCancelar}>
          Cancelar
        </Button>
        <Button className="px-4" disabled={!listo} isPending={enviando} onPress={() => onConfirmar(limpiar(motivo))}>
          Confirmar
        </Button>
      </View>
    </View>
  );
};

/** «Enf. 12 · Farm. 40», con el faltante de Enfermería en rojo. */
/** En qué va la consulta de existencia: para no dejar el renglón mudo mientras carga o si falla. */
export type EstadoDeExistencia = 'cargando' | 'error' | 'listo';

/**
 * Nunca devuelve null. Antes, mientras la existencia cargaba —o si la consulta
 * fallaba— el renglón se quedaba sin la línea y Enfermería aplicaba a ciegas
 * sin saber que le faltaba un dato. Ahora el hueco dice qué pasa.
 */
export const ExistenciaDelRenglon: React.FC<{ existencia?: ExistenciaPorArea; necesita?: number; estado?: EstadoDeExistencia }> = ({ existencia, necesita, estado = 'listo' }) => {
  if (!existencia) {
    if (estado === 'cargando') return <Text className="text-xs text-gray-400">Consultando existencia…</Text>;
    return <Text className="text-xs text-warning-500">Sin lectura de existencia · revisa el almacén antes de aplicar</Text>;
  }
  const faltaEnEnfermeria = necesita !== undefined && existencia.nursing < necesita;
  return (
    <Text className="text-xs">
      <Text className={clx('text-xs', faltaEnEnfermeria ? 'text-error-500' : 'text-gray-500')}>Enfermería {existencia.nursing}</Text>
      <Text className="text-xs text-gray-500"> · Farmacia {existencia.pharmacy}</Text>
      {faltaEnEnfermeria && <Text className="text-xs text-error-500">{` · faltan ${necesita! - existencia.nursing} en Enfermería`}</Text>}
    </Text>
  );
};

/** Quién quitó o cambió qué, y por qué. */
export const HistorialDeAjustes: React.FC<{ ajustes?: AjusteDeOrden[] }> = ({ ajustes }) => {
  if (!ajustes?.length) return null;
  return (
    <View className="gap-1 rounded-xl bg-gray-50 p-3">
      <Text className="text-xs text-gray-500">Ajustes</Text>
      {ajustes.map((a) => (
        <Text key={a.id} className="text-xs">
          {a.actor_name ?? 'Alguien'}
          {a.actor_role ? ` (${roleLabel(a.actor_role)})` : ''}: {a.product_title ?? 'renglón'}{' '}
          {a.quantity_after === 0 ? 'quitado' : `${a.quantity_before} → ${a.quantity_after}`}
          {a.reason ? `. ${a.reason}` : ''}
        </Text>
      ))}
    </View>
  );
};

/**
 * Una línea para la orden CERRADA: si se puede aplicar entera con lo que hay
 * en Enfermería, o cuántos renglones no alcanzan. Antes había que abrir cada
 * orden para saberlo, y con seis en la bandeja nadie lo hacía.
 */
export const ResumenDeExistencia: React.FC<{
  items: { variant_id: string; quantity: number }[];
  existencias?: Record<string, ExistenciaPorArea>;
  estado: EstadoDeExistencia;
}> = ({ items, existencias, estado }) => {
  if (estado === 'cargando') return <Text className="text-xs text-gray-400">Consultando existencia…</Text>;
  if (estado === 'error' || !existencias) return <Text className="text-xs text-warning-500">Sin lectura de existencia</Text>;
  const faltan = items.filter((i) => (existencias[i.variant_id]?.nursing ?? 0) < i.quantity).length;
  if (faltan === 0) return <Text className="text-xs text-success-500">Todo en Enfermería</Text>;
  return (
    <Text className="text-xs text-error-500">
      {faltan === 1 ? 'Falta 1 renglón en Enfermería' : `Faltan ${faltan} renglones en Enfermería`}
    </Text>
  );
};
