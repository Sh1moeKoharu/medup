import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/HapticTab';
import { Settings } from '@/components/icons/settings';
import { Store } from '@/components/icons/store';
import { UserRound } from '@/components/icons/user-round';

export const unstable_settings = {
  initialRouteName: 'products',
  detachInactiveScreens: false,
};

export default function DoctorTabLayout() {
  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: '#282828',
        tabBarInactiveTintColor: '#B5B5B5',
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
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <Settings size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
