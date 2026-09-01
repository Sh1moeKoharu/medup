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

  return (
    <Modal
      transparent={true}
      statusBarTranslucent
      animationType={animationType}
      {...modalProps}
      onRequestClose={onRequestClose}
    >
      {/* CUIDADO: no poner "auto" a secas.

          react-native-web deja un modal cerrado montado pero con opacity 0 y
          pointer-events: none — invisible e inofensivo. Al forzar "auto" sin
          condición, ese resto invisible se quedaba TRAGÁNDOSE los clics de toda
          la pantalla, y el síntoma era que dejaba de responder el diálogo de
          abajo: es lo que le pasaba al cajero con "Añadir Nuevo Cliente" dentro
          de la búsqueda de paciente.

          Se reactiva sólo mientras el diálogo está a la vista, que es cuando
          hace falta vencer el pointer-events:none que react-navigation pone en
          el <body>. */}
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
    </Modal>
  );
};
