import { GuardaDeRol } from '@/components/GuardaDeRol';
import { ROLES_RH } from '@/constants/acceso';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { Archive } from '@/components/icons/archive';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Settings } from '@/components/icons/settings';
import { Wallet } from '@/components/icons/wallet';

export const unstable_settings = {
  initialRouteName: 'reportes',
  detachInactiveScreens: false,
};

/**
 * La interfaz de RH y contabilidad: lo que hace falta para la nómina.
 *
 * Consulta los cortes, la actividad del personal y los honorarios; no ve
 * contenido clínico ni mueve inventario. Lo que escribe —esquemas de comisión
 * y pagos— lo valida el servidor.
 */
export default function RhTabLayout() {
  const { width } = useWindowDimensions();
  const esTelefono = width < 768;

  return (
    <GuardaDeRol permitidos={ROLES_RH}>
      <Tabs
        detachInactiveScreens={false}
        screenOptions={{
          tabBarActiveTintColor: color.pestanaActiva,
          tabBarInactiveTintColor: color.pestanaInactiva,
          headerShown: false,
          tabBarButton: HapticTab,
          animation: 'shift',
          tabBarItemStyle: esTelefono ? { paddingHorizontal: 0 } : undefined,
          tabBarLabelStyle: esTelefono ? { fontSize: width < 360 ? 9 : 10 } : undefined,
        }}
      >
        <Tabs.Screen
          name="reportes"
          options={{
            title: 'Reportes',
            tabBarIcon: ({ color }) => <Archive size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="nomina"
          options={{
            title: 'Nómina',
            tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="cortes"
          options={{
            title: 'Cortes',
            tabBarIcon: ({ color }) => <Wallet size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Ajustes',
            tabBarIcon: ({ color }) => <Settings size={20} color={color} />,
          }}
        />
      </Tabs>
    </GuardaDeRol>
  );
}
