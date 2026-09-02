import { Text } from '@/components/ui/Text';
import { roleLabel } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import { useBloqueo } from '@/contexts/bloqueo';
import * as React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';

/**
 * Quién está usando el equipo, y cómo salir.
 *
 * ── POR QUÉ FLOTANTE Y EN LA RAÍZ ───────────────────────────────────────────
 * El tester pidió poder cerrar sesión sin entrar a Ajustes, y en TODOS los
 * perfiles. Las pantallas del punto de venta no comparten una cabecera, así que
 * ponerlo pantalla por pantalla habría significado tocar una docena de sitios y
 * olvidar alguna. Aquí se dibuja una sola vez, encima de todo, y aparece en
 * cualquier perfil por construcción.
 *
 * Muestra también el ROL. En un mostrador donde varias personas comparten el
 * mismo equipo, saber con qué perfil está abierta la sesión evita justo el
 * problema que reportaron: alguien trabajando en una interfaz que no le toca
 * sin darse cuenta.
 *
 * Se oculta cuando la sesión está pausada: la pantalla de bloqueo ya ofrece sus
 * propias salidas y no debe haber nada operable por encima de ella.
 */
export const BarraDeSesion: React.FC = () => {
  const { state, logout } = useAuthCtx();
  const { bloqueado, bloquear } = useBloqueo();
  const [confirmando, setConfirmando] = React.useState(false);

  if (state.status !== 'authenticated' || bloqueado) {
    return null;
  }

  const rol = state.user.role ? roleLabel(state.user.role) : null;

  return (
    <View
      // 'fixed' sólo existe en web; en móvil 'absolute' cubre igual.
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
        top: 8,
        right: 12,
        zIndex: 9000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View className="rounded-full bg-white/90 px-3 py-1.5 border border-gray-200">
        <Text className="text-xs">
          {state.user.name || state.userEmail}
          {rol ? ` · ${rol}` : ''}
        </Text>
      </View>

      <TouchableOpacity
        onPress={bloquear}
        accessibilityLabel="Pausar sesión"
        className="rounded-full border border-gray-200 bg-white/90 px-3 py-1.5"
      >
        <Text className="text-xs">Pausar</Text>
      </TouchableOpacity>

      {confirmando ? (
        <>
          <TouchableOpacity
            onPress={() => logout()}
            className="rounded-full bg-error-500 px-3 py-1.5"
          >
            <Text className="text-xs text-white">Confirmar salida</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfirmando(false)}
            className="rounded-full border border-gray-200 bg-white/90 px-3 py-1.5"
          >
            <Text className="text-xs">Cancelar</Text>
          </TouchableOpacity>
        </>
      ) : (
        // Con confirmación a propósito: cerrar sesión vacía el carrito, y un
        // botón siempre visible se pulsa sin querer.
        <TouchableOpacity
          onPress={() => setConfirmando(true)}
          accessibilityLabel="Cerrar sesión"
          className="rounded-full border border-gray-200 bg-white/90 px-3 py-1.5"
        >
          <Text className="text-xs">Salir</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
