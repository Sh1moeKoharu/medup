import { Printer } from '@/components/icons/printer';
import { Text } from '@/components/ui/Text';
import { ROLES_CAJA, ROLES_PANEL } from '@/constants/acceso';
import { normalizeRole, roleLabel } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import { useBloqueo } from '@/contexts/bloqueo';
import { irAlPanel } from '@/utils/panel';
import { aUsuario } from '@/utils/usuario';
import { router } from 'expo-router';
import * as React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Quién está usando el equipo, y cómo salir.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El tester pidió poder cerrar sesión sin entrar a Ajustes, y en TODOS los
 * perfiles. Las pantallas del punto de venta no comparten una cabecera, así que
 * ponerlo pantalla por pantalla habría significado tocar una docena de sitios y
 * olvidar alguna. Se dibuja una sola vez, en la raíz, y aparece en cualquier
 * perfil por construcción.
 *
 * Muestra también el ROL. En un mostrador donde varias personas comparten el
 * mismo equipo, saber con qué perfil está abierta la sesión evita justo el
 * problema que reportaron: alguien trabajando en una interfaz que no le toca
 * sin darse cuenta.
 *
 * ── POR QUÉ YA NO FLOTA ─────────────────────────────────────────────────────
 * Antes era una fila flotante anclada abajo a la izquierda. No capturaba toques
 * —eso se arregló en su momento—, pero seguía DIBUJÁNDOSE encima de los botones
 * de la parte inferior. Medido en el carrito a 375 px: "Cancelar" y "Cobrar"
 * ocupaban de 698 a 722, y la barra de 715 a 731. Las pastillas tapaban el
 * texto de los dos botones.
 *
 * No era cuestión de moverla: abajo están las filas de acción de casi todas las
 * pantallas —cobrar, corte de caja, emitir receta— y arriba están los títulos y
 * los buscadores. Cualquier sitio flotante tapa algo.
 *
 * Así que deja de flotar: ocupa su propia franja arriba y la aplicación se
 * dibuja debajo. No puede solaparse con nada porque ya no comparte espacio con
 * nadie. Cuesta unos 34 px de alto; a cambio no hay que ir reservándole hueco
 * pantalla por pantalla, que es justo lo que se olvida al añadir una nueva.
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

  const rolCanonico = normalizeRole(state.user.role);
  const puedeIrAlPanel = !!rolCanonico && ROLES_PANEL.includes(rolCanonico);
  const puedeCobrar = !!rolCanonico && ROLES_CAJA.includes(rolCanonico);

  const abrirPanel = async () => {
    // El puente de sesión y la dirección viven en `utils/panel.ts`: lo mismo lo
    // usa el inicio de sesión, que manda a Administración directo al panel.
    const fue = await irAlPanel(state.medusaUrl, state.apiKey);
    if (!fue) {
      // El servidor cerró el panel a este rol. Se dice aquí, en vez de mandar
      // a una pantalla de acceso que tampoco lo dejaría pasar.
      Toast.show({
        type: 'error',
        text1: 'El panel es sólo para Administración',
        text2: 'Tu trabajo está en el punto de venta.',
      });
    }
  };

  return (
    <View className="flex-row items-center gap-2 border-b border-gray-200 bg-white px-4 pb-2 pt-safe-offset-2">
      {/*
        Quién está en sesión es lo ÚNICO que puede encogerse: es información, no
        una acción. Al quedarse estrecho se corta con puntos suspensivos en vez
        de empujar los botones fuera de la pantalla.

        Se oculta mientras se confirma la salida: ahí el usuario está
        respondiendo una pregunta, el nombre no ayuda, y son los píxeles que
        necesitan los dos botones para caber en un teléfono.
      */}
      {!confirmando && (
        <View style={{ flexShrink: 1 }} className="flex-1">
          <Text className="text-xs text-gray-500" numberOfLines={1}>
            {state.user.name || aUsuario(state.userEmail)}
            {rol ? ` · ${rol}` : ''}
          </Text>
        </View>
      )}

      {/* Empuja los botones a la derecha cuando la identidad no está. */}
      {confirmando && <View className="flex-1" />}

      {/*
        El paso al PANEL.

        ── POR QUÉ FALTABA ─────────────────────────────────────────────────
        El camino existía en un solo sentido. Desde el panel hay un atajo al
        punto de venta, pero desde aquí no había ninguno, y Administración
        aterriza en la caja: su trabajo —configuración, personal, reportes—
        vive en el panel y no tenía forma de llegar sin escribir la dirección
        a mano. Farmacia igual, que surte las recetas desde allá.

        No se cambia a dónde aterrizan. El administrador está en el punto de
        venta a propósito, para acompañar al mostrador cuando algo falla; lo
        que faltaba era la vuelta.

        Sólo se enseña a quien tiene algo que hacer allí. A un cajero el
        panel le responde que no, así que un botón que lleva a una negativa
        es peor que no tener botón.
      */}
      {puedeIrAlPanel && !confirmando && (
        <TouchableOpacity
          onPress={abrirPanel}
          accessibilityLabel="Ir al panel de administración"
          style={{ flexShrink: 0 }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1"
        >
          <Text className="text-xs">Panel</Text>
        </TouchableOpacity>
      )}

      {/*
        La impresora, para quien cobra.

        La pantalla ya existia, pero enterrada en Ajustes -> Impresion, y es lo
        que hay que tocar el dia que se cambia la termica del mostrador o se
        estrena un equipo. Aqui esta a un toque desde cualquier pantalla.

        Solo se enseña a quien cobra. Un medico o una enfermera no imprimen
        tickets, y un icono que no lleva a nada de su trabajo es ruido.
      */}
      {puedeCobrar && !confirmando && (
        <TouchableOpacity
          onPress={() => router.push('/settings/impresion')}
          accessibilityLabel="Ajustes de impresión"
          style={{ flexShrink: 0 }}
          className="min-h-toque justify-center rounded-full border border-gray-200 bg-white px-3"
        >
          <Printer size={14} className="text-gray-500" />
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={bloquear}
        accessibilityLabel="Pausar sesión"
        // Los botones nunca encogen: un botón a medias no se puede pulsar.
        style={{ flexShrink: 0 }}
        className="rounded-full border border-gray-200 bg-white px-3 py-1"
      >
        <Text className="text-xs">Pausar</Text>
      </TouchableOpacity>

      {confirmando ? (
        <>
          <TouchableOpacity
            // Se limpia ANTES de salir: la barra sobrevive al cambio de usuario y,
            // sin esto, quien entraba despues veia "Confirmar salida" ya armado.
            onPress={() => {
              setConfirmando(false);
              logout();
            }}
            style={{ flexShrink: 0 }}
            className="rounded-full bg-error-500 px-3 py-1"
          >
            <Text className="text-xs text-white">Confirmar salida</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setConfirmando(false)}
            style={{ flexShrink: 0 }}
            className="rounded-full border border-gray-200 bg-white px-3 py-1"
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
          style={{ flexShrink: 0 }}
          className="rounded-full border border-gray-200 bg-white px-3 py-1"
        >
          <Text className="text-xs">Salir</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
