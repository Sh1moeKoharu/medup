import { getHomeRoute } from '@/utils/home-route';
import { useAuthCtx } from '@/contexts/auth';
import { useSettings } from '@/contexts/settings';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';
import { color } from '@/theme/tokens';

export default function RootLoadingScreen() {
  const router = useRouter();
  const auth = useAuthCtx();
  const settings = useSettings();

  const isSetupComplete =
    settings.isSuccess &&
    !!settings.data &&
    !!settings.data.sales_channel &&
    !!settings.data.region &&
    !!settings.data.stock_location;

  React.useEffect(() => {
    if (auth.state.status === 'unauthenticated') {
      // If the user is not authenticated, redirect to the login screen
      router.replace('/login');
      return;
    }

    if (auth.state.status === 'authenticated') {
      if (settings.isSuccess) {
        if (!isSetupComplete) {
          // If settings are not set, redirect to the setup wizard
          router.replace('/setup-wizard');
          return;
        } else {
          // Ruteo por rol canónico.
          //
          // Antes esto adivinaba el rol a partir del correo (`includes('medico')`,
          // `=== 'doctor@pos.com'`) porque el rol almacenado no era confiable: el
          // admin guardaba "enfermero" y aquí se comparaba contra 'nurse'.
          // Unificado el vocabulario, la heurística sobra y se elimina: un correo
          // como "medico.jefe@clinica.mx" con rol de caja ya no abre la vista médica.
          //
          // Si la app se abrio con una direccion concreta (enlace directo, o
          // F5 en mitad de un corte), a ella se vuelve DESPUES de aterrizar
          // aqui: lo hace hooks/useRestaurarRutaInicial.ts. Hacerlo desde este
          // efecto no sirve: tras el inicio de sesion el navegador esta a medio
          // recomponerse y el reemplazo cae en la pestana equivocada.
          //
          // Con el grupo de Caja este reemplazo, lanzado justo cuando el Stack
          // quita la pantalla de login, deja el navegador a medias (pinta
          // Productos pero la direccion dice /activity). Lo remata
          // hooks/useRestaurarRutaInicial.ts, que ademas restaura la ruta
          // pedida si la app se abrio con un enlace directo.
          router.replace(getHomeRoute(auth.state.user.role) as any);
          return;
        }
      }
    }
  }, [auth.state.status, settings.isSuccess, router, isSetupComplete]);

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: color.lienzo }}>
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={{
          width: 233,
          height: 233,
        }}
        resizeMode="contain"
      />
    </View>
  );
}
