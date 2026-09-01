import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { useBloqueo } from '@/contexts/bloqueo';
import * as React from 'react';
import { Platform, TextInput, View } from 'react-native';

/**
 * Pantalla de bloqueo.
 *
 * ── POR QUÉ NO ES UN Modal ──────────────────────────────────────────────────
 * Se dibuja como una capa fija dentro del árbol de la aplicación, no con el
 * Modal de react-native-web. Ese Modal trae su propio atrapador de foco, y ya
 * nos costó dos días descubrir que se pelea con el de react-navigation hasta
 * dejar los campos de texto sin poder recibir foco. Aquí hay justamente un
 * campo de contraseña: es el último sitio donde conviene arriesgarse a eso.
 *
 * El z-index va por encima del que usa el Modal (9999) para que el bloqueo
 * tape también cualquier cuadro que estuviera abierto al bloquear.
 */
export const PantallaBloqueada: React.FC = () => {
  const { bloqueado, desbloquear } = useBloqueo();
  const { state, logout } = useAuthCtx();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [verificando, setVerificando] = React.useState(false);

  React.useEffect(() => {
    if (bloqueado) {
      setPassword('');
      setError('');
    }
  }, [bloqueado]);

  if (!bloqueado || state.status !== 'authenticated') {
    return null;
  }

  const intentar = async () => {
    if (!password || verificando) return;
    setVerificando(true);
    setError('');

    const ok = await desbloquear(password);

    if (!ok) {
      setError('Contraseña incorrecta.');
      setPassword('');
    }
    setVerificando(false);
  };

  return (
    <View
      // 'fixed' sólo existe en web; en móvil 'absolute' cubre igual la pantalla.
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483000,
        backgroundColor: '#101418',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View className="w-full max-w-sm items-center">
        <Text className="text-3xl text-white">Sesión en pausa</Text>
        <Text className="mt-2 text-center text-gray-400">
          El turno de caja y el carrito siguen abiertos.
        </Text>

        <View className="mt-8 w-full rounded-2xl bg-white p-6">
          <Text className="text-sm text-gray-400">Continuar como</Text>
          <Text className="mb-4 text-lg">{state.user.name || state.userEmail}</Text>

          <TextInput
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={intentar}
            placeholder="Contraseña"
            secureTextEntry
            autoFocus
            returnKeyType="go"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-4 text-base"
          />

          {!!error && <Text className="mt-2 text-sm text-error-500">{error}</Text>}

          <Button className="mt-4" onPress={intentar} isPending={verificando}>
            Continuar
          </Button>
        </View>

        <Button
          variant="outline"
          className="mt-4 w-full border-gray-600"
          textClassName="text-gray-300"
          onPress={() => logout()}
        >
          Cerrar sesión
        </Button>
        <Text className="mt-2 text-center text-xs text-gray-500">
          Cerrar sesión vacía el carrito y deja el turno de caja abierto.
        </Text>
      </View>
    </View>
  );
};
