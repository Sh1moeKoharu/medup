import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { roleLabel } from '@/constants/roles';
import { Platform, View } from 'react-native';
import React from 'react';

/**
 * Pantalla para quien inicia sesión en el punto de venta pero no trabaja aquí.
 *
 * Hoy llegan dos perfiles:
 *
 *  · Auditoría / Dirección, que es de SOLO LECTURA. No cobra, no dispensa y no
 *    prescribe; sus reportes y la bitácora viven en el panel.
 *  · Cualquier cuenta cuyo rol no se pueda interpretar.
 *
 * Antes ambos acababan en la interfaz de CAJA, que era el valor por omisión.
 * Una pantalla que dice qué pasa y a dónde ir es mejor que dejar a alguien
 * delante de una caja registradora que no le toca.
 */
export default function SinPosScreen() {
  const { state, logout } = useAuthCtx();
  const rol = state.status === 'authenticated' ? state.user.role : null;
  const nombre = state.status === 'authenticated' ? state.user.name : '';

  const irAlPanel = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = '/app';
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-white p-8">
      <View className="w-full max-w-md">
        <Text className="text-3xl">Tu trabajo está en el panel</Text>

        <Text className="mt-4 text-gray-500">
          {nombre ? `${nombre}, tu ` : 'Tu '}perfil
          {rol ? ` (${roleLabel(rol)})` : ''} no usa el punto de venta.
        </Text>

        <Text className="mt-2 text-gray-500">
          Los reportes, la bitácora y la configuración están en el panel de
          administración.
        </Text>

        <Button className="mt-8" onPress={irAlPanel}>
          Ir al panel
        </Button>

        <Button variant="outline" className="mt-2" onPress={() => logout()}>
          Cerrar sesión
        </Button>

        {!rol && (
          <Text className="mt-6 text-sm text-gray-400">
            Si crees que esto es un error, pide a un administrador que revise tu
            perfil en Ajustes → Personal: la cuenta no tiene un rol asignado que
            el sistema reconozca.
          </Text>
        )}
      </View>
    </View>
  );
}
