import { Loader } from '@/components/icons/loader';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { TouchableOpacity, TouchableOpacityProps } from 'react-native';

export type ButtonProps = TouchableOpacityProps & {
  isPending?: boolean;
  /**
   * `solid` es la acción de la pantalla y sólo debería haber una a la vista.
   * `outline` acompaña. `ghost` es para acciones menores dentro de una fila o
   * una cabecera, donde un borde ensuciaría.
   * `danger` es para lo que destruye: dar de baja, cancelar, destruir un lote.
   */
  variant?: 'solid' | 'outline' | 'ghost' | 'danger';
  /** `sm` para barras y filas; `md` es el de las pantallas. */
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  textClassName?: string;
};

/**
 * El botón del sistema.
 *
 * ── LA ACCIÓN ES TINTA, NO COLOR ────────────────────────────────────────────
 * El botón principal es negro cálido sobre el lienzo crema. Reservar el color
 * para el estado —lo que caduca, lo que falta, lo que salió mal— es lo que hace
 * que ese color signifique algo cuando aparece. Si los botones también fueran
 * de color, un aviso rojo sería un elemento más de la pantalla.
 *
 * ── ALTURA MÍNIMA ───────────────────────────────────────────────────────────
 * `min-h-toque` son 44 px, el mínimo de las guías de iOS y Android. En un
 * mostrador se pulsa deprisa, de pie y a veces con guantes; un botón que se
 * queda corto se falla y se vuelve a intentar.
 */
export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  isPending = false,
  disabled = false,
  variant = 'solid',
  size = 'md',
  icon,
  iconPosition = 'right',
  textClassName,
  ...props
}) => {
  const inerte = disabled || isPending;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled: inerte, busy: isPending }}
      disabled={inerte}
      activeOpacity={0.85}
      className={clx(
        'min-h-toque items-center justify-center gap-x-2 rounded-xl',
        size === 'sm' ? 'px-3 py-2' : 'p-4',
        iconPosition === 'left' ? 'flex-row-reverse' : 'flex-row',
        {
          'bg-black': variant === 'solid',
          'border border-gray-300 bg-transparent': variant === 'outline',
          'bg-transparent': variant === 'ghost',
          'bg-error-500': variant === 'danger',
          // Deshabilitado: se apaga el relleno y el borde a la vez, para que no
          // quede un botón gris con borde negro.
          'border-gray-200 bg-gray-100': inerte && variant !== 'ghost',
        },
        className,
      )}
      {...props}
    >
      <Text
        className={clx(
          size === 'sm' ? 'text-sm' : 'text-lg',
          {
            'text-white': variant === 'solid' || variant === 'danger',
            'text-black': variant === 'outline' || variant === 'ghost',
            'text-gray-300': inerte,
          },
          textClassName,
        )}
      >
        {children}
      </Text>
      {isPending && <Loader size={16} color={color.textoTerciario} className="animate-spin" />}
      {typeof icon !== 'undefined' && !isPending ? icon : null}
    </TouchableOpacity>
  );
};
