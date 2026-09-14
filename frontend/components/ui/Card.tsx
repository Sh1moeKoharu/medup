import { clx } from '@/utils/clx';
import { View, ViewProps } from 'react-native';

export type CardProps = ViewProps & {
  /**
   * `plain` es la tarjeta normal: blanca sobre el lienzo, sin borde. La
   * separación la da el propio contraste con el fondo.
   *
   * `outlined` añade el hairline. Se usa cuando la tarjeta va sobre una
   * superficie del mismo tono y el contraste solo no basta.
   *
   * `raised` añade sombra. Sólo para lo que de verdad flota sobre el contenido:
   * una columna lateral, un panel que se superpone.
   */
  variant?: 'plain' | 'outlined' | 'raised';
  /** `none` cuando la tarjeta contiene una lista que pone su propio relleno. */
  padding?: 'none' | 'sm' | 'md';
};

/**
 * La tarjeta del sistema.
 *
 * Existe porque hasta ahora cada pantalla la reinventaba: aparecían
 * `rounded-xl border border-gray-200 bg-white p-4`, `rounded-2xl bg-white p-3`
 * y media docena de combinaciones más, todas con la intención de ser lo mismo.
 *
 * La separación por defecto de este sistema es el contraste con el lienzo, no
 * el borde ni la sombra. Por eso `plain` no lleva ninguno de los dos: sobre el
 * crema, una superficie blanca ya se lee como una tarjeta.
 */
export const Card: React.FC<CardProps> = ({
  variant = 'plain',
  padding = 'md',
  className,
  ...props
}) => {
  return (
    <View
      className={clx(
        'rounded-xl bg-white',
        {
          'border border-gray-200': variant === 'outlined',
          'shadow-card': variant === 'raised',
          'p-3': padding === 'sm',
          'p-4': padding === 'md',
        },
        className,
      )}
      {...props}
    />
  );
};
