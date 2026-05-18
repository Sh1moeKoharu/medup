import { Tabs } from 'expo-router';

import { useCurrentDraftOrder } from '@/api/hooks/draft-orders';
import { HapticTab } from '@/components/HapticTab';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Clock } from '@/components/icons/clock';
import { ScanBarcode } from '@/components/icons/scan-barcode';
import { Settings } from '@/components/icons/settings';
import { Wallet } from '@/components/icons/wallet';

import { Store } from '@/components/icons/store';
import { UserRound } from '@/components/icons/user-round';

export const unstable_settings = {
  initialRouteName: 'products',
  detachInactiveScreens: false,
};

export default function TabLayout() {
  const draftOrder = useCurrentDraftOrder();

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
        name="orders"
        options={{
          title: 'Órdenes',
          tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: 'Escanear',
          tabBarIcon: ({ color }) => <ScanBarcode size={20} color={color} />,
          tabBarStyle: { display: 'none' },
        }}
      />



      <Tabs.Screen
        name="crm"
        options={{
          title: 'Directorio',
          tabBarIcon: ({ color }) => <UserRound size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="activity"
        options={{
          title: 'Actividad',
          tabBarIcon: ({ color }) => <Clock size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cash-register"
        options={{
          title: 'Caja',
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
  );
}
