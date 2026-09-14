import { clx } from '@/utils/clx';
import { Platform, ScrollView, ScrollViewProps, View, ViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
  KeyboardToolbar,
} from 'react-native-keyboard-controller';

/**
 * El contenedor de todas las pantallas del punto de venta.
 *
 * ── EL LIENZO NO ES BLANCO ──────────────────────────────────────────────────
 * Es `bg-canvas`, un crema muy claro. Dos razones, y ninguna es decorativa:
 *
 *  1. Un blanco puro a pantalla completa deslumbra bajo la luz de un mostrador.
 *  2. Antes el fondo y las tarjetas eran EL MISMO blanco, así que para separar
 *     una tarjeta del fondo hacía falta dibujarle un borde. Con el lienzo un
 *     punto por debajo, la tarjeta blanca se separa sola y el borde pasa a ser
 *     opcional.
 *
 * Ese segundo punto es el que cambia la pantalla entera: los 65 `bg-white` que
 * ya existían en las pantallas pasan a leerse como tarjetas sobre el lienzo,
 * sin editar ninguno.
 *
 * ⚠️ La franja superior de las dos variantes con desplazamiento también va en
 * `bg-canvas`. Es la que tapa el contenido bajo la barra de estado: si se queda
 * en blanco, aparece una banda clara sobre el lienzo al desplazar.
 */
export const Layout: React.FC<ViewProps> = ({ className, ...props }) => {
  return (
    <View
      className={clx(
        'px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6 flex-1 bg-canvas',
        className,
      )}
      {...props}
    />
  );
};

export const LayoutWithScroll: React.FC<ScrollViewProps> = (props) => {
  return (
    <View className="relative flex-1 bg-canvas">
      <View className="pt-safe absolute left-0 right-0 top-0 z-10 bg-canvas" />
      <ScrollView
        {...props}
        className={clx('flex-1', props.className)}
        contentContainerClassName={clx('px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6', props.contentContainerClassName)}
      >
        {props.children}
      </ScrollView>
    </View>
  );
};

export const LayoutWithKeyboardAvoidingScroll: React.FC<KeyboardAwareScrollViewProps> = (props) => {
  return (
    <View className="relative flex-1 bg-canvas">
      <View className="pt-safe absolute left-0 right-0 top-0 z-10 bg-canvas" />
      <KeyboardAwareScrollView
        {...props}
        bottomOffset={Platform.OS === 'android' ? 45 : 76}
        className={clx('flex-1', props.className)}
        contentContainerClassName={clx(
          'px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6 bg-canvas',
          props.contentContainerClassName,
        )}
      >
        {props.children}
      </KeyboardAwareScrollView>
      <KeyboardToolbar />
    </View>
  );
};
