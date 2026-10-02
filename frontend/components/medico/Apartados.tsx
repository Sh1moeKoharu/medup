import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';

/**
 * Los apartados de la pantalla del médico: Productos, Pacientes y Mis recetas
 * en UNA sola pantalla.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Eran tres pestañas de la barra inferior y la consulta obligaba a saltar
 * entre ellas: buscar al paciente en una, armar la receta en otra, ver lo
 * emitido en la tercera. El tester pidió «englobar y unificar la vista de
 * Productos, Pacientes y Recetas». La base es la pantalla de Productos —que en
 * pantalla ancha ya lleva la receta al lado— y los otros dos pasan a ser
 * apartados de ella: se cambia de apartado sin salir de la pantalla y sin
 * perder la receta en curso.
 */
export type Apartado = 'productos' | 'pacientes' | 'recetas';

const APARTADOS: { clave: Apartado; etiqueta: string }[] = [
  { clave: 'pacientes', etiqueta: 'Pacientes' },
  { clave: 'productos', etiqueta: 'Productos' },
  { clave: 'recetas', etiqueta: 'Mis recetas' },
];

export const Apartados: React.FC<{ valor: Apartado; onChange: (a: Apartado) => void; className?: string }> = ({ valor, onChange, className }) => (
  <View accessibilityRole="tablist" className={clx('flex-row gap-2 rounded-2xl border border-gray-200 bg-white p-1', className)}>
    {APARTADOS.map((a) => {
      const activo = a.clave === valor;
      return (
        <TouchableOpacity
          key={a.clave}
          accessibilityRole="tab"
          accessibilityState={{ selected: activo }}
          accessibilityLabel={a.etiqueta}
          onPress={() => onChange(a.clave)}
          className={clx('flex-1 items-center rounded-xl px-1 py-3 md:px-3', activo ? 'bg-black' : 'bg-transparent')}
        >
          <Text numberOfLines={1} className={clx('text-sm md:text-base', activo ? 'font-semibold text-white' : 'text-gray-600')}>
            {a.etiqueta}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);
