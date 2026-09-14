import { GuardaDeRol } from '@/components/GuardaDeRol';
import { ROLES_AUDITORIA } from '@/constants/acceso';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { Clock } from '@/components/icons/clock';
import { Package } from '@/components/icons/package';
import { Settings } from '@/components/icons/settings';
import { TriangleAlert } from '@/components/icons/triangle-alert';
import { Wallet } from '@/components/icons/wallet';

export const unstable_settings = {
  initialRouteName: 'bitacora',
  detachInactiveScreens: false,
};

/**
 * La interfaz de Auditoría / Dirección: todo de sólo lectura.
 *
 * Hasta la fase 7 este perfil aterrizaba en una pantalla que lo mandaba al
 * panel. El panel es ahora sólo de Administración, así que lo que consultaba
 * allí —la bitácora con filtros, el kardex de los dos almacenes, las
 * caducidades con su exportación y los cortes de caja— vive aquí.
 *
 * No hay botones de escritura porque el servidor no se los aceptaría
 * (`denyReadOnlyMutations`); un botón que lleva a una negativa es ruido.
 */
export default function AuditoriaTabLayout() {
  const { width } = useWindowDimensions();
  const esTelefono = width < 768;

  return (
    <GuardaDeRol permitidos={ROLES_AUDITORIA}>
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
          name="bitacora"
          options={{
            title: 'Bitácora',
            tabBarIcon: ({ color }) => <Clock size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="kardex"
          options={{
            title: 'Kardex',
            tabBarIcon: ({ color }) => <Package size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="caducidades"
          options={{
            title: 'Caducidad',
            tabBarIcon: ({ color }) => <TriangleAlert size={20} color={color} />,
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
