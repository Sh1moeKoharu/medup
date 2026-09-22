import { GuardaDeRol } from '@/components/GuardaDeRol';
import { ROLES_ENFERMERIA } from '@/constants/acceso';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';
import { useWindowDimensions } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { FilePen } from '@/components/icons/file-pen';
import { Package } from '@/components/icons/package';
import { Settings } from '@/components/icons/settings';
import { Store } from '@/components/icons/store';
import { UserRound } from '@/components/icons/user-round';

export const unstable_settings = {
  initialRouteName: 'bandeja',
  detachInactiveScreens: false,
};

export default function NurseTabLayout() {
  // En pantalla ancha la receta ya va como columna lateral del catalogo;
  // la pestana solo hace falta en telefono o tableta vertical.
  const { width } = useWindowDimensions();
  const recetaEnLateral = width >= 1024;

  return (
    <GuardaDeRol permitidos={ROLES_ENFERMERIA}>
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: color.pestanaActiva,
        tabBarInactiveTintColor: color.pestanaInactiva,
        headerShown: false,
        tabBarButton: HapticTab,
        animation: 'shift',
      }}
    >
      <Tabs.Screen
        name="products"
        options={{
          title: 'Productos',
          tabBarIcon: ({ color }) => <Store size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="crm"
        options={{
          title: 'Pacientes',
          tabBarIcon: ({ color }) => <UserRound size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: 'Receta',
          href: recetaEnLateral ? null : undefined,
          // Documento que se escribe, para no repetir el icono de "Mis recetas":
          // dos pestanas vecinas con el mismo dibujo no se distinguen.
          tabBarIcon: ({ color }) => <FilePen size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="bandeja"
        options={{
          title: 'Bandeja',
          tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="recetas"
        options={{
          title: 'Mis recetas',
          tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="almacen"
        options={{
          title: 'Almacén',
          tabBarIcon: ({ color }) => <Package size={20} color={color} />,
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
