import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * La pantalla de un solo mensaje.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * Hay cuatro pantallas que son lo mismo: un callejón sin salida que explica qué
 * pasa y ofrece una o dos salidas. «Tu trabajo está en el panel», «Falta
 * configurar el punto de venta», «Esta pantalla no existe» y la espera del
 * asistente. Cada una estaba escrita a mano, con su propio ancho, su propio
 * margen y su propio tono de gris; una ni siquiera pintaba el lienzo, así que
 * salía sobre el fondo del navegador.
 *
 * ── LA COMPOSICIÓN ──────────────────────────────────────────────────────────
 * La misma del inicio de sesión: tarjeta blanca centrada sobre el lienzo crema.
 * Como el lienzo está un punto por debajo del blanco, la tarjeta se separa sola
 * y no lleva borde, sólo `shadow-card`.
 *
 * ── POR QUÉ NO LLEVA LA MARCA ───────────────────────────────────────────────
 * El inicio de sesión sí lleva «Altus» encima, porque es la puerta de entrada y
 * hay que saber a qué se entra. Aquí no: a estas pantallas se llega ya dentro,
 * el mensaje es lo único que importa, y una marca a 40 px encima de un título a
 * 32 px deja dos tamaños grandes peleándose. La jerarquía la hace el peso, no
 * acumular tamaños.
 *
 * El ancho es 448 px, más que los 384 del inicio de sesión: aquí hay párrafos
 * que leer, no dos campos que rellenar.
 */
export const PantallaDeAviso: React.FC<{
  titulo: string;
  /** El cuerpo. Se separan solos: no hace falta poner márgenes. */
  children?: React.ReactNode;
  /** Botones. Van al pie de la tarjeta, el principal primero. */
  acciones?: React.ReactNode;
  /** Letra pequeña. Va FUERA de la tarjeta, que es donde se lee como aparte. */
  pie?: React.ReactNode;
  className?: string;
}> = ({ titulo, children, acciones, pie, className }) => (
  <SafeAreaView className="flex-1 bg-canvas">
    <View className="flex-1 items-center justify-center p-6">
      <View className={clx('w-full max-w-md', className)}>
        <View className="rounded-2xl bg-white p-6 shadow-card">
          <Text className="text-3xl">{titulo}</Text>
          {children ? <View className="mt-4 gap-2">{children}</View> : null}
          {acciones ? <View className="mt-7 gap-2">{acciones}</View> : null}
        </View>
        {pie ? <View className="mt-5 px-2">{pie}</View> : null}
      </View>
    </View>
  </SafeAreaView>
);

/** El párrafo del cuerpo. Texto secundario, que es `gray-400` en el sistema. */
export const ParrafoDeAviso: React.FC<React.ComponentProps<typeof Text>> = ({
  className,
  ...props
}) => <Text className={clx('text-gray-400', className)} {...props} />;
