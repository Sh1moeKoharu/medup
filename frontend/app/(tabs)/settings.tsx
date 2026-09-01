import { Antenna } from '@/components/icons/antenna';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { useClearSettings, useSettings } from '@/contexts/settings';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';
import { clx } from '@/utils/clx';
import React from 'react';
import { VERSION_COMMIT, VERSION_FECHA } from '@/utils/version.generated';
import { useBloqueo } from '@/contexts/bloqueo';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const auth = useAuthCtx();
  const settings = useSettings();
  const clearSettings = useClearSettings();

  const [isDialogVisible, setIsDialogVisible] = React.useState(false);
  const bloqueo = useBloqueo();

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
        <Text className="mb-4 text-2xl">Seguridad</Text>
        <Button onPress={bloqueo.bloquear} variant="outline" className="mb-2 justify-center">
          Pausar sesión
        </Button>
        <Text className="mb-4 text-sm text-gray-400">
          Bloquea la pantalla sin cerrar sesión. El turno de caja y el carrito se
          conservan; para volver hace falta la contraseña.
        </Text>

        <Text className="mb-2 text-sm text-gray-400">Bloquear sola tras</Text>
        <View className="mb-2 flex-row flex-wrap gap-2">
          {[0, 5, 10, 15, 30].map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => bloqueo.cambiarMinutos(m)}
              className={clx('rounded-xl border px-4 py-3', {
                'border-black bg-black': bloqueo.minutosInactividad === m,
                'border-gray-200': bloqueo.minutosInactividad !== m,
              })}
            >
              <Text className={bloqueo.minutosInactividad === m ? 'text-white' : ''}>
                {m === 0 ? 'Nunca' : `${m} min`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="mb-8 text-sm text-gray-400">
          Viene en &quot;Nunca&quot; para no estorbar durante las pruebas. Antes de
          abrir al público conviene ponerlo en 10 o 15 minutos: es lo que protege
          la caja cuando alguien se va sin acordarse de pausarla.
        </Text>

        <Text className="mb-4 text-2xl">Versión</Text>
        {/* Viaja dentro del paquete compilado, asi que es necesariamente la
            version que se esta ejecutando. Un git pull sin recompilar deja el
            servidor y lo servido desincronizados sin avisar. */}
        <View className="mb-8 rounded-xl border border-gray-200 p-4">
          <Text className="text-base">{VERSION_COMMIT}</Text>
          {!!VERSION_FECHA && (
            <Text className="text-sm text-gray-400">
              Compilado el {new Date(VERSION_FECHA).toLocaleString('es-MX')}
            </Text>
          )}
        </View>

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
