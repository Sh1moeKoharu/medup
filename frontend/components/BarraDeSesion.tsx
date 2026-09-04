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
/**
 * Los estilos van en `style` y no en `className`, a propósito.
 *
 * Esta barra es el asidero para salir de una sesión en un equipo compartido: si
 * no se ve, no cumple su función. Escrita con clases dependía de que NativeWind
 * las resolviera, y en este proyecto ya nos ha pasado que no lo hace —la hoja
 * del producto se quedó sin estilos por eso—. Con `style` se pinta siempre.
 *
 * Los colores son literales por el mismo motivo: no dependen de que el tema
 * defina un token.
 */

/** Sombra suave: despega la barra del contenido para que se lea sobre blanco. */
const SOMBRA = {
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 3,
} as const;

/** Quién está dentro. Es información, no acción: se queda discreto. */
const CHIP = {
  borderRadius: 999,
  backgroundColor: '#fff',
  borderWidth: 1,
  borderColor: '#e5e7eb',
  paddingHorizontal: 12,
  paddingVertical: 7,
  ...SOMBRA,
} as const;

/** Pausar y Cancelar: acciones menores, contorno. */
const SECUNDARIO = {
  borderRadius: 999,
  backgroundColor: '#fff',
  borderWidth: 1,
  borderColor: '#d1d5db',
  paddingHorizontal: 14,
  paddingVertical: 7,
  ...SOMBRA,
} as const;

/**
 * Cerrar sesión: oscuro y sólido, igual que en el panel.
 *
 * En blanco sobre fondo blanco no se encontraba —el tester lo buscó en dos
 * equipos distintos y no lo vio—. Dice "Cerrar sesión" completo y no "Salir",
 * que en una caja se confunde con salir de la pantalla.
 */
const PRINCIPAL = {
  borderRadius: 999,
  backgroundColor: '#111827',
  paddingHorizontal: 16,
  paddingVertical: 8,
  ...SOMBRA,
} as const;

const TEXTO_OSCURO = { fontSize: 13, color: '#fff', fontWeight: '600' } as const;

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
        // Abajo a la IZQUIERDA, por encima de la barra de pestanas.
        //
        // Arriba a la derecha chocaba con el titulo del carrito, que en pantalla
        // grande vive justo ahi. Abajo a la izquierda esta libre en los tres
        // perfiles: el buscador va centrado arriba, el carrito a la derecha y
        // las pestanas ocupan el borde inferior.
        bottom: 74,
        left: 12,
        zIndex: 9000,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <View style={CHIP}>
        <Text style={{ fontSize: 12, color: '#374151' }}>
          {state.user.name || state.userEmail}
          {rol ? ` · ${rol}` : ''}
        </Text>
      </View>

      <TouchableOpacity
        onPress={bloquear}
        accessibilityLabel="Pausar sesión"
        style={SECUNDARIO}
      >
        <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>Pausar</Text>
      </TouchableOpacity>

      {confirmando ? (
        <>
          <TouchableOpacity
            onPress={() => logout()}
            style={{ ...PRINCIPAL, backgroundColor: '#dc2626' }}
          >
            <Text style={TEXTO_OSCURO}>Confirmar salida</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmando(false)} style={SECUNDARIO}>
            <Text style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}>Cancelar</Text>
          </TouchableOpacity>
        </>
      ) : (
        // Con confirmación a propósito: cerrar sesión vacía el carrito, y un
        // botón siempre visible se pulsa sin querer.
        <TouchableOpacity
          onPress={() => setConfirmando(true)}
          accessibilityLabel="Cerrar sesión"
          style={PRINCIPAL}
        >
          <Text style={TEXTO_OSCURO}>Cerrar sesión</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
