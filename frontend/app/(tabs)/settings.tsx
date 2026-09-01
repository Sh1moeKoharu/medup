import { Antenna } from '@/components/icons/antenna';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { useClearSettings, useSettings } from '@/contexts/settings';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const auth = useAuthCtx();
  const settings = useSettings();
  const clearSettings = useClearSettings();

  const [isDialogVisible, setIsDialogVisible] = React.useState(false);

  return (
    <>
      <LayoutWithScroll>
        <Text className="mt-8 mb-6 text-4xl">Ajustes</Text>
        <Text className="mb-4 text-2xl">Canal de Ventas</Text>
        <Button
          onPress={() => router.push('/settings/sales-channel')}
          variant="outline"
          icon={<Antenna size={16} />}
          iconPosition="left"
          className="mb-8 justify-end"
        >
          {settings.data?.sales_channel?.name || '—'}
        </Button>
        <Text className="mb-4 text-2xl">Región</Text>
        <Button
          onPress={() => router.push('/settings/region')}
          variant="outline"
          icon={<Antenna size={16} />}
          iconPosition="left"
          className="mb-8 justify-end"
        >
          {settings.data?.region?.name || '—'}
        </Button>
        <Text className="mb-4 text-2xl">Ubicación de inventario</Text>
        <Button
          onPress={() => router.push('/settings/stock-location')}
          variant="outline"
          icon={<Antenna size={16} />}
          iconPosition="left"
          className="mb-8 justify-end"
        >
          {settings.data?.stock_location?.name || '—'}
        </Button>
        <Text className="mb-4 text-2xl">Impresión</Text>
        <Button
          onPress={() => router.push('/settings/impresion')}
          variant="outline"
          icon={<Antenna size={16} />}
          iconPosition="left"
          className="mb-8 justify-end"
        >
          Ticket y impresora
        </Button>
        <Text className="mb-4 text-2xl">Restablecer</Text>
        <Button
          variant="outline"
          onPress={() => {
            clearSettings.mutate();
          }}
          className="mb-8"
        >
          Borrar Ajustes
        </Button>
        <Text className="mb-4 text-2xl">Cuenta</Text>
        <Button onPress={() => setIsDialogVisible(true)} className="mb-4">
          Cerrar Sesión
        </Button>
        <Text className="text-gray-300">Saldrás de tu cuenta.</Text>
      </LayoutWithScroll>

      <Prompt
        onSubmit={async () => {
          setIsDialogVisible(false);
          queryClient.clear();
          router.replace('/login');
          await auth.logout();
        }}
        onClose={() => setIsDialogVisible(false)}
        submitText="Cerrar Sesión"
        cancelText="Cancelar"
        title="¿Estás seguro de que quieres cerrar sesión?"
        visible={isDialogVisible}
        showCloseButton={false}
        dismissOnOverlayPress={false}
      />
    </>
  );
}
