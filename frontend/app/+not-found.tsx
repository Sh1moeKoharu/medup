import { Button } from '@/components/ui/Button';
import { PantallaDeAviso, ParrafoDeAviso } from '@/components/ui/PantallaDeAviso';
import { Stack, useRouter } from 'expo-router';

/**
 * La dirección no existe.
 *
 * Antes era un `SafeAreaView` sin fondo, así que se pintaba sobre el blanco del
 * navegador en vez de sobre el lienzo, y el título del navegador decía «Oops!»,
 * en inglés y en una aplicación que no habla así.
 *
 * La salida es un botón de verdad y no un enlace de texto: en una tableta, un
 * renglón subrayado es un objetivo de 20 px que se falla de pie.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Página no encontrada' }} />
      <PantallaDeAviso
        titulo="Esta pantalla no existe"
        acciones={<Button onPress={() => router.replace('/')}>Ir al inicio</Button>}
      >
        <ParrafoDeAviso>
          La dirección que abriste no corresponde a ninguna pantalla del punto de
          venta. Puede que el enlace esté mal escrito o que sea de una versión
          anterior.
        </ParrafoDeAviso>
      </PantallaDeAviso>
    </>
  );
}
