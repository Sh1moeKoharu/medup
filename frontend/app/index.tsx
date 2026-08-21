import { ROLES, normalizeRole } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import { useSettings } from '@/contexts/settings';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, View } from 'react-native';

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
          const role = normalizeRole(auth.state.user.role);

          if (role === ROLES.DOCTOR) {
            router.replace('/(doctor)/products');
          } else if (role === ROLES.NURSE) {
            router.replace('/(nurse)/products');
          } else {
            router.replace('/(tabs)/products');
          }
          return;
        }
      }
    }
  }, [auth.state.status, settings.isSuccess, router, isSetupComplete]);

  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#f4faff' }}>
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
