import { GuardaDeRol } from '@/components/GuardaDeRol';
import { ROLES_ALMACEN } from '@/constants/acceso';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Clock } from '@/components/icons/clock';
import { Package } from '@/components/icons/package';
import { PackageOpen } from '@/components/icons/package-open';
import { Settings } from '@/components/icons/settings';
import { TriangleAlert } from '@/components/icons/triangle-alert';
import { Truck } from '@/components/icons/truck';

export const unstable_settings = {
  initialRouteName: 'existencias',
  detachInactiveScreens: false,
};

/**
 * La interfaz de Farmacia: el almacén.
 *
 * Hasta la fase 7 Farmacia compartía la interfaz de Caja, donde no podía
 * cobrar (el servidor se lo impide) pero sí veía el corte de turno, y hacía
 * su trabajo de verdad —lotes, surtido de recetas, traspasos— en el panel.
 * El panel es ahora sólo de Administración, así que todo eso vive aquí.
 *
 * Siete pestañas, como Caja, y con el mismo ajuste de etiqueta en teléfono
 * (ver el comentario largo en (tabs)/_layout.tsx): la más larga es
 * «Caducidad» (9 letras), igual que «Productos» allá.
 */
export default function AlmacenTabLayout() {
  const { width } = useWindowDimensions();
  const esTelefono = width < 768;

  return (
    <GuardaDeRol permitidos={ROLES_ALMACEN}>
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
          name="existencias"
          options={{
            title: 'Almacén',
            tabBarIcon: ({ color }) => <Package size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="recetas"
          options={{
            title: 'Recetas',
            tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="traspasos"
          options={{
            title: 'Traspasos',
            tabBarIcon: ({ color }) => <Truck size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="lotes"
          options={{
            title: 'Lotes',
            tabBarIcon: ({ color }) => <PackageOpen size={20} color={color} />,
          }}
        />
        <Tabs.Screen
          name="kardex"
          options={{
            title: 'Kardex',
            tabBarIcon: ({ color }) => <Clock size={20} color={color} />,
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
