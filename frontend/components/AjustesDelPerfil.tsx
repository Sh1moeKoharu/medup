import { Antenna } from '@/components/icons/antenna';
import { MiTurno } from '@/components/MiTurno';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { useClearSettings, useSettings } from '@/contexts/settings';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';

/**
 * La pantalla de Ajustes de los perfiles que no cobran: Almacén y Auditoría.
 *
 * Es la misma que tienen Médico y Enfermería —qué canal, región y ubicación
 * usa este equipo, y cerrar sesión—, pero como componente, para que los dos
 * grupos nuevos la monten sin una copia más. Las de Médico y Enfermería se
 * quedan como están: el guardián de diseño vigila que sigan idénticas entre
 * sí y no conviene moverlas de paso.
 */
export const AjustesDelPerfil: React.FC<{ nota?: string; conTurno?: boolean }> = ({ nota, conTurno }) => {
  const queryClient = useQueryClient();
  const auth = useAuthCtx();
  const settings = useSettings();
  const clearSettings = useClearSettings();

  const [confirmando, setConfirmando] = React.useState(false);

  return (
    <>
      <LayoutWithScroll>
        <Text className="mt-8 mb-6 text-4xl">Ajustes</Text>
        {nota ? <Text className="mb-6 text-gray-400">{nota}</Text> : null}
        {conTurno ? <MiTurno /> : null}
        <Text className="mb-4 text-2xl">Canal de ventas</Text>
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
        <Text className="mb-4 text-2xl">Restablecer</Text>
        <Button
          variant="outline"
          onPress={() => {
            clearSettings.mutate();
          }}
          className="mb-8"
        >
          Borrar ajustes
        </Button>
        <Text className="mb-4 text-2xl">Cuenta</Text>
        <Button onPress={() => setConfirmando(true)} className="mb-4">
          Cerrar sesión
        </Button>
        <Text className="text-gray-300">Saldrás de tu cuenta.</Text>
      </LayoutWithScroll>

      <Prompt
        onSubmit={async () => {
          setConfirmando(false);
          queryClient.clear();
          router.replace('/login');
          await auth.logout();
        }}
        onClose={() => setConfirmando(false)}
        submitText="Cerrar sesión"
        cancelText="Cancelar"
        title="¿Estás seguro de que quieres cerrar sesión?"
        visible={confirmando}
        showCloseButton={false}
        dismissOnOverlayPress={false}
      />
    </>
  );
};
