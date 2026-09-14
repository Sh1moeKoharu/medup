import { Almacen, useAlmacenes } from '@/api/hooks/requisiciones';
import type { TipoDeMovimiento } from '@/api/hooks/almacen';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

/**
 * Piezas que comparten las pantallas de Almacén y de Auditoría: el chip de
 * filtro, el campo de texto, la sección con título, el selector de almacén y
 * las etiquetas del kardex. Antes cada pantalla llevaba su copia; con dos
 * grupos nuevos que las usan todas, mejor una sola.
 */

export const Chip: React.FC<{ activo: boolean; onPress: () => void; children: string }> = ({ activo, onPress, children }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: activo }}
    className={clx('min-h-toque justify-center rounded-full border px-3', activo ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white')}
  >
    <Text className={clx('text-sm', activo ? 'text-active-500' : 'text-gray-500')}>{children}</Text>
  </Pressable>
);

/** Una fila de chips que se desplaza en horizontal cuando no caben. */
export const Chips: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} className={clx('max-h-14', className)} contentContainerClassName="gap-2 py-1">
    {children}
  </ScrollView>
);

export const Campo: React.FC<React.ComponentProps<typeof TextInput>> = ({ className, ...props }) => (
  <TextInput
    // Números de lote, claves de estante y motivos cortos: el corrector del
    // navegador los subraya todos en rojo y no ayuda a nadie.
    spellCheck={false}
    placeholderTextColor="#777169"
    className={clx('min-h-toque rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900', className)}
    {...props}
  />
);

/**
 * En un catálogo de una sola presentación, Medusa llama «Default» a la
 * variante y el título sale como «Paracetamol — Default». Sobra en pantalla.
 */
export const sinVarianteUnica = (titulo: string) => titulo.replace(/\s+[—-]\s+Default$/i, '');

/**
 * Campo con su nombre encima. En cuanto se escribe, el marcador desaparece y
 * un formulario de nueve casillas llenas deja de decir cuál es cuál.
 */
export const CampoConEtiqueta: React.FC<React.ComponentProps<typeof Campo> & { etiqueta: string }> = ({ etiqueta, className, ...props }) => (
  <View className={clx('gap-1', className)}>
    <Text className="text-xs text-gray-500">{etiqueta}</Text>
    <Campo accessibilityLabel={etiqueta} {...props} />
  </View>
);

export const Seccion: React.FC<{ titulo: string; descripcion?: string; children: React.ReactNode; className?: string }> = ({ titulo, descripcion, children, className }) => (
  <View className={clx('mb-8 gap-3', className)}>
    <View>
      <Text className="text-2xl">{titulo}</Text>
      {descripcion ? <Text className="text-sm text-gray-400">{descripcion}</Text> : null}
    </View>
    {children}
  </View>
);

/** Etiqueta pequeña de estado, con el color que le toca. */
export const Distintivo: React.FC<{ tono: 'gris' | 'exito' | 'aviso' | 'error' | 'info'; children: string }> = ({ tono, children }) => {
  const clases = {
    gris: ['bg-gray-100', 'text-gray-500'],
    exito: ['bg-success-200', 'text-success-500'],
    aviso: ['bg-warning-200', 'text-warning-500'],
    error: ['bg-error-200', 'text-error-500'],
    info: ['bg-info-200', 'text-info-500'],
  }[tono];
  return (
    <View className={clx('rounded-full px-3 py-1', clases[0])}>
      <Text className={clx('text-xs', clases[1])}>{children}</Text>
    </View>
  );
};

export const fechaCorta = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
};

export const soloFecha = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Nombre corto del almacén para chips y filas: «Farmacia», «Enfermería» o su nombre. */
export const nombreDeAlmacen = (a: Almacen | undefined | null) => {
  if (!a) return 'Sin almacén';
  if (a.area === 'pharmacy') return 'Farmacia';
  if (a.area === 'nursing') return 'Enfermería';
  return a.name;
};

/**
 * Chips para elegir almacén. `todos` añade la opción de no filtrar (para el
 * kardex y las caducidades de Auditoría, que miran los dos).
 */
export const SelectorDeAlmacen: React.FC<{
  valor: string | null;
  onChange: (id: string | null) => void;
  todos?: boolean;
}> = ({ valor, onChange, todos }) => {
  const almacenes = useAlmacenes();
  const lista = almacenes.data ?? [];
  return (
    <Chips>
      {todos && (
        <Chip activo={valor === null} onPress={() => onChange(null)}>
          Los dos almacenes
        </Chip>
      )}
      {lista.map((a) => (
        <Chip key={a.id} activo={valor === a.id} onPress={() => onChange(a.id)}>
          {nombreDeAlmacen(a)}
        </Chip>
      ))}
    </Chips>
  );
};

/**
 * Elige el almacén inicial de una pantalla: el de Farmacia si existe, si no
 * el primero. Devuelve null mientras carga.
 */
export const useAlmacenInicial = (preferido: 'pharmacy' | 'nursing' = 'pharmacy') => {
  const almacenes = useAlmacenes();
  const [valor, setValor] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (valor !== null || !almacenes.data?.length) return;
    const elegido = almacenes.data.find((a) => a.area === preferido) ?? almacenes.data[0];
    setValor(elegido.id);
  }, [almacenes.data, preferido, valor]);
  return [valor, setValor, almacenes.data ?? []] as const;
};

export const ETIQUETA_MOVIMIENTO: Record<TipoDeMovimiento, string> = {
  entry_purchase: 'Compra',
  entry_return: 'Devolución',
  entry_adjustment: 'Ajuste (entrada)',
  entry_transfer: 'Traspaso recibido',
  entry_initial: 'Carga inicial',
  exit_sale: 'Venta o surtido',
  exit_adjustment: 'Ajuste (salida)',
  exit_transfer: 'Traspaso enviado',
  exit_expiry: 'Caducidad',
  exit_damage: 'Baja por daño',
};

export const etiquetaDeMovimiento = (tipo: string) => ETIQUETA_MOVIMIENTO[tipo as TipoDeMovimiento] ?? tipo;

export const ETIQUETA_LOTE: Record<string, { texto: string; tono: 'gris' | 'exito' | 'aviso' | 'error' }> = {
  active: { texto: 'Activo', tono: 'exito' },
  quarantined: { texto: 'En cuarentena', tono: 'aviso' },
  destroyed: { texto: 'Destruido', tono: 'gris' },
};
