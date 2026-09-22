// import 'react-native-reanimated';
import { AppStatusBar } from '@/components/AppStatusBar';
import '../global.css';

import { SplashScreenController } from '@/components/SplashScreenController';
import { toastConfig } from '@/config/toast';
import { AuthProvider, useAuthCtx } from '@/contexts/auth';
import { RecetaProvider } from '@/contexts/receta';
import { useSettings } from '@/contexts/settings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useRestaurarRutaInicial } from '@/hooks/useRestaurarRutaInicial';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, usePathname } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as React from 'react';
import { Platform, View } from 'react-native';
import { BloqueoProvider, useBloqueo } from '@/contexts/bloqueo';
import { PantallaBloqueada } from '@/components/PantallaBloqueada';
import { BarraDeSesion } from '@/components/BarraDeSesion';


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});

function App() {
  const auth = useAuthCtx();
  const settings = useSettings();

  const isSetupComplete =
    settings.isSuccess &&
    !!settings.data &&
    !!settings.data.sales_channel &&
    !!settings.data.region &&
    !!settings.data.stock_location;

  // Enlaces directos y F5: ver hooks/useRestaurarRutaInicial.ts.
  useRestaurarRutaInicial(isSetupComplete);

  return (
    <Stack>
      <Stack.Protected guard={auth.state.status === 'authenticated' && isSetupComplete}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(doctor)" options={{ headerShown: false }} />
        <Stack.Screen name="(nurse)" options={{ headerShown: false }} />
        {/* Farmacia y Auditoría (fase 7): antes la una compartía la interfaz
            de Caja y la otra iba a una pantalla que la mandaba al panel. */}
        <Stack.Screen name="(almacen)" options={{ headerShown: false }} />
        <Stack.Screen name="(auditoria)" options={{ headerShown: false }} />
        <Stack.Screen name="(rh)" options={{ headerShown: false }} />

        <Stack.Screen name="checkout/[draftOrderId]" options={{ title: 'Cobro', headerShown: false }} />

        <Stack.Screen
          name="product-details"
          options={{
            presentation: 'transparentModal',
            title: 'Detalle del producto',
            headerShown: false,
            animation: 'none',
            animationDuration: 0,
            gestureEnabled: false,
            fullScreenGestureShadowEnabled: false,
          }}
        />
        <Stack.Screen
          name="orders/[orderId]"
          options={{
            presentation: 'transparentModal',
            title: 'Detalle del pedido',
            headerShown: false,
            animation: 'none',
            animationDuration: 0,
            gestureEnabled: false,
            fullScreenGestureShadowEnabled: false,
          }}
        />
        <Stack.Screen
          name="customer-lookup"
          options={{
            presentation: 'transparentModal',
            title: 'Buscar paciente',
            headerShown: false,
            animation: 'none',
          }}
        />

        <Stack.Screen name="settings/impresion" options={{ headerShown: false }} />

        <Stack.Screen name="settings/stock-location" options={{ headerShown: false }} />

        <Stack.Screen name="settings/create-stock-location" options={{ headerShown: false }} />

        <Stack.Screen name="settings/region" options={{ headerShown: false }} />

        <Stack.Screen name="settings/create-region" options={{ headerShown: false }} />

        <Stack.Screen name="settings/sales-channel" options={{ headerShown: false }} />

        <Stack.Screen name="settings/create-sales-channel" options={{ headerShown: false }} />

        <Stack.Screen name="sin-pos" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={auth.state.status === 'authenticated' && settings.isSuccess && !isSetupComplete}>
        <Stack.Screen name="setup-wizard" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={auth.state.status === 'unauthenticated'}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Screen options={{ headerShown: false }} name="index" />
    </Stack>
  );
}

/**
 * Marca actividad del usuario, para el bloqueo por inactividad.
 *
 * Se escucha en fase de CAPTURA y sin interferir: solo anota la hora del ultimo
 * gesto. Sin captura, un componente que detuviera la propagacion dejaria de
 * contar como actividad y la caja se bloquearia en mitad del uso.
 */
const DetectorDeActividad: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { registrarActividad } = useBloqueo();

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    eventos.forEach((e) => document.addEventListener(e, registrarActividad, true));

    return () => {
      eventos.forEach((e) => document.removeEventListener(e, registrarActividad, true));
    };
  }, [registrarActividad]);

  return <>{children}</>;
};

/**
 * En web, el documento no debe desplazarse nunca: cada pantalla trae su propio
 * desplazamiento.
 *
 * ── EL FALLO QUE ARREGLA ────────────────────────────────────────────────────
 * El aviso flotante (Toast) espera escondido POR DEBAJO del borde inferior, y
 * eso deja el documento unos 100 px más alto que la ventana. En un teléfono o
 * una tableta, al tocar un campo el navegador desplaza el documento para
 * enseñarlo, y el `overflow: hidden` del body impide que vuelva solo. Resultado:
 * la barra de sesión se sale por arriba, la barra de pestañas sube y queda un
 * hueco vacío abajo — «la barra inferior se encima con los botones de usuario y
 * cerrar sesión», como lo reportó la clínica.
 *
 * Se devuelve el documento a su sitio al cambiar de pantalla y al soltar un
 * campo. No se fija en cada desplazamiento: mientras el teclado está abierto,
 * el navegador necesita moverlo para que el campo no quede tapado.
 */
const useDocumentoFijo = () => {
  const ruta = usePathname();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.scrollTo(0, 0);
  }, [ruta]);
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const alSoltar = () =>
      setTimeout(() => {
        const activo = document.activeElement;
        const escribiendo = activo && (activo.tagName === 'INPUT' || activo.tagName === 'TEXTAREA');
        if (!escribiendo && document.scrollingElement?.scrollTop) window.scrollTo(0, 0);
      }, 150);
    document.addEventListener('focusout', alSoltar);
    return () => document.removeEventListener('focusout', alSoltar);
  }, []);
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useDocumentoFijo();

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister: asyncStoragePersister }}>
        <AuthProvider>
          {/* Receta en construcción del área médica: va dentro de Auth porque
              se guarda por usuario. */}
          <RecetaProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <SplashScreenController />
            <AppStatusBar />
            <BloqueoProvider>
              {/* Columna: la barra de sesion ocupa su franja y la aplicacion se
                  queda con el resto de la altura.

                  Antes la barra flotaba encima y tapaba los botones inferiores
                  de cobrar, corte de caja y emitir receta. Al ponerla en el
                  flujo no puede solaparse con nada, y no hay que reservarle
                  hueco pantalla por pantalla. Ver components/BarraDeSesion.tsx. */}
              <View style={{ flex: 1 }}>
                <BarraDeSesion />
                {/* El detector va por FUERA de <App/> para que cualquier gesto en
                    cualquier pantalla cuente como actividad. Dentro de una
                    pantalla, salir de ella dejaria de reiniciar el contador. */}
                <DetectorDeActividad>
                  {/* flex: 1 explicito: con un hermano encima, sin esto la
                      aplicacion se quedaria con su altura natural. */}
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <App />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </DetectorDeActividad>
              </View>
              {/* Va DESPUES: la pantalla de bloqueo se dibuja por encima de todo,
                  barra incluida. */}
              <PantallaBloqueada />
            </BloqueoProvider>
            <Toast config={toastConfig} position="bottom" />
          </ThemeProvider>
          </RecetaProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
