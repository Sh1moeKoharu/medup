import { useAbrirTurnoMedico, useCerrarTurnoMedico, useMiTurnoMedico } from '@/api/hooks/honorarios';
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

export default function DoctorSettingsScreen() {
  const queryClient = useQueryClient();
  const auth = useAuthCtx();
  const settings = useSettings();
  const clearSettings = useClearSettings();

  const [isDialogVisible, setIsDialogVisible] = React.useState(false);

  // El turno del médico: desde que entra a consulta hasta que sale. Sirve
  // para el reporte de trabajo por turno y para los honorarios.
  const turno = useMiTurnoMedico();
  const abrirTurno = useAbrirTurnoMedico();
  const cerrarTurno = useCerrarTurnoMedico();

  return (
    <>
      <LayoutWithScroll>
        <Text className="mt-8 mb-6 text-4xl">Ajustes</Text>
        <Text className="mb-4 text-2xl">Mi turno</Text>
        {turno.data ? (
          <>
            <Text className="mb-2 text-gray-400">
              Abierto desde {new Date(turno.data.opened_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Button variant="outline" className="mb-8" onPress={() => cerrarTurno.mutate(turno.data!.id)} isPending={cerrarTurno.isPending}>
              Cerrar turno
            </Button>
          </>
        ) : (
          <>
            <Text className="mb-2 text-gray-400">Sin turno abierto. Ábrelo al empezar la consulta.</Text>
            <Button className="mb-8" onPress={() => abrirTurno.mutate()} isPending={abrirTurno.isPending || turno.isLoading}>
              Abrir turno
            </Button>
          </>
        )}
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
        <Button onPress={() => setIsDialogVisible(true)} className="mb-4">
          Cerrar sesión
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
        submitText="Cerrar sesión"
        cancelText="Cancelar"
        title="¿Estás seguro de que quieres cerrar sesión?"
        visible={isDialogVisible}
        showCloseButton={false}
        dismissOnOverlayPress={false}
      />
    </>
  );
}
