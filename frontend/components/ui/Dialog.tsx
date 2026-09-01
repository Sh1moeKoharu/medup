import { X } from '@/components/icons/x';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import { useKeyboard } from '@react-native-community/hooks';
import React from 'react';
import {
  GestureResponderEvent,
  Modal,
  ModalProps,
  Platform,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface DialogProps extends ModalProps {
  title?: string;
  showCloseButton?: boolean;
  dismissOnOverlayPress?: boolean;
  className?: string;
  containerClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  onClose?: () => void;
  onOverlayPress?: (event: GestureResponderEvent) => void;
  onCloseIconPress?: (event: GestureResponderEvent) => void;
  /**
   * Para pantallas que YA SON una ruta modal transparente.
   *
   * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
   * Una ruta declarada `presentation: 'transparentModal'` ya se dibuja encima
   * de la anterior, y react-navigation le pone su PROPIO gestor de foco al
   * contenedor de esa ruta. Si dentro montamos además un Modal de
   * react-native-web, que trae otro atrapador de foco, los dos se pelean:
   *
   *   focus() sobre los div del cuadro     <- el atrapador del Modal
   *   focusout / focus() sobre el contenedor de la ruta  <- react-navigation
   *   focus() sobre los div del cuadro     <- y vuelta a empezar
   *
   * Medido en la caja con las herramientas del navegador. El resultado es que
   * los campos de texto NUNCA reciben el foco —el clic les llega, nadie cancela
   * nada, pero el foco no aterriza— y no se puede escribir. Los botones sí
   * funcionan porque llevan su propio manejador de clic y no dependen del foco.
   *
   * Con esta bandera el cuadro se dibuja sin envolver en Modal: sólo queda el
   * gestor de foco de react-navigation y la pelea desaparece. Visualmente es
   * idéntico, porque la capa oscura y la tarjeta son las mismas.
   */
  comoRuta?: boolean;
}

/**
 * ── POR QUÉ HACE FALTA pointerEvents="auto" ────────────────────────────────
 * Medido en un navegador real. Cuando hay una ruta presentada como
 * `transparentModal`, react-navigation apaga los eventos de puntero en el
 * <body> para que no se pueda interactuar con la pantalla de debajo, y los
 * vuelve a encender SÓLO en su propio contenedor:
 *
 *   body                       -> pointer-events: none
 *     #root                    -> none (heredado)
 *     [portal del Modal]       -> none (heredado)   <- aquí vive este cuadro
 *     transparentDrawerContent -> auto              <- sólo lo suyo
 *
 * El Modal de react-native-web se dibuja en un portal colgado del <body>, que
 * es HERMANO de ese contenedor, así que se quedaba apagado. `pointer-events`
 * se hereda, de modo que no respondía nada de dentro: ni la X, ni las filas de
 * la lista, ni el botón de confirmar. Se veía perfectamente y estaba muerto.
 *
 * Reencenderlo aquí es el mismo recurso que usa react-navigation en su propio
 * contenedor: un descendiente puede reactivar lo que un antecesor apagó.
 */
export const Dialog: React.FC<DialogProps> = ({
  title,
  children,
  showCloseButton = true,
  dismissOnOverlayPress = true,
  className,
  containerClassName,
  contentClassName,
  headerClassName,
  animationType = 'fade',
  onClose,
  onOverlayPress,
  onCloseIconPress,
  comoRuta = false,
  ...modalProps
}) => {
  const safeAreaInsets = useSafeAreaInsets();
  const keyboard = useKeyboard();

  const onRequestClose = React.useCallback<Exclude<ModalProps['onRequestClose'], undefined>>(
    (event) => {
      if (modalProps.onRequestClose) {
        return modalProps.onRequestClose(event);
      }

      onClose?.();
    },
    [modalProps, onClose],
  );

  const handleOverlayPress = React.useCallback(
    (event: GestureResponderEvent) => {
      if (dismissOnOverlayPress) {
        if (onOverlayPress) {
          return onOverlayPress(event);
        }

        onClose?.();
      }
    },
    [dismissOnOverlayPress, onOverlayPress, onClose],
  );

  const handleCloseIconPress = React.useCallback(
    (event: GestureResponderEvent) => {
      if (onCloseIconPress) {
        return onCloseIconPress(event);
      }

      onClose?.();
    },
    [onClose, onCloseIconPress],
  );

  // CUIDADO con pointerEvents: no poner "auto" a secas.
  //
  // react-native-web deja un modal cerrado montado pero con opacity 0 y
  // pointer-events: none — invisible e inofensivo. Al forzar "auto" sin
  // condición, ese resto invisible se quedaba TRAGÁNDOSE los clics de toda la
  // pantalla, y el síntoma era que dejaba de responder el diálogo de abajo.
  //
  // Se reactiva sólo mientras el diálogo está a la vista, que es cuando hace
  // falta vencer el pointer-events:none que react-navigation pone en el <body>.
  const cuerpo = (
    <View
      pointerEvents={modalProps.visible ? 'auto' : 'none'}
      className={clx('flex-1 items-center justify-center bg-black/50', className)}
      style={{
        paddingTop: safeAreaInsets.top,
        paddingRight: safeAreaInsets.right,
        paddingLeft: safeAreaInsets.left,
        paddingBottom: keyboard.keyboardShown
          ? keyboard.keyboardHeight + (Platform.OS === 'android' ? safeAreaInsets.bottom : 0)
          : safeAreaInsets.bottom,
      }}
    >
      <TouchableWithoutFeedback onPress={handleOverlayPress}>
        <View className="absolute inset-0" />
      </TouchableWithoutFeedback>

      <View className="max-h-full w-full items-center p-4">
        {/* max-w-lg: en un monitor de escritorio, sin limite de ancho el
            cuadro se estiraba de lado a lado de la pantalla — un campo de
            'Monto' de 1400 px de ancho para escribir '50'. En movil el ancho
            de pantalla sigue mandando, porque es menor que este maximo.
            Se puede ampliar por cuadro con containerClassName (twMerge deja
            que la clase de fuera gane). */}
        <View className={clx('max-h-full w-full max-w-lg overflow-hidden rounded-2xl bg-white p-4', containerClassName)}>
          {(title || showCloseButton) && (
            <View className={clx('mb-4 flex-row items-center justify-between gap-2', headerClassName)}>
              {title && <Text className="text-xl">{title}</Text>}
              {showCloseButton && (
                <TouchableOpacity onPress={handleCloseIconPress} accessibilityLabel="Cerrar">
                  <X size={20} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View className={contentClassName}>{children}</View>
        </View>
      </View>
    </View>
  );

  // Sin Modal cuando la pantalla ya es una ruta modal: ver la nota de
  // `comoRuta` en las props. Dos atrapadores de foco a la vez impiden escribir.
  if (comoRuta) {
    return modalProps.visible === false ? null : cuerpo;
  }

  return (
    <Modal
      transparent={true}
      statusBarTranslucent
      animationType={animationType}
      {...modalProps}
      onRequestClose={onRequestClose}
    >
      {cuerpo}
    </Modal>
  );
};
