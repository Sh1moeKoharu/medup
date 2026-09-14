import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      /**
       * El relleno lateral se anula a propósito.
       *
       * El botón de cada pestaña trae 5 px a cada lado de serie. Como la
       * etiqueta se recorta con puntos suspensivos al llegar al borde de su
       * caja, esos 10 px salían del texto: a 375 px la caja quedaba en 44 px y
       * "Productos" —que mide 46— aparecía como "Produc…". Lo mismo con
       * "Directorio" y "Actividad".
       *
       * No se pierde nada por quitarlo: el icono y la etiqueta ya van
       * centrados, y el ancho de la pestaña lo reparte el contenedor. Lo único
       * que hacía ese relleno era estrechar la caja del texto.
       *
       * Va aquí y no en `tabBarItemStyle` de cada barra porque ese ajuste se
       * aplica a un contenedor de más arriba y no llega a este botón, que es
       * donde está el relleno (comprobado en el DOM: el <a> seguía con 5 px).
       */
      style={[props.style, { paddingHorizontal: 0 }]}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
