import { X } from '@/components/icons/x';
import { Text } from '@/components/ui/Text';
import { toastConfig } from '@/config/toast';
import { clx } from '@/utils/clx';
import { useKeyboard } from '@react-native-community/hooks';
import React from 'react';
import { GestureResponderEvent, Modal, ModalProps, Platform, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { scheduleOnRN } from 'react-native-worklets';

export interface BottomSheetProps extends Pick<ModalProps, 'visible' | 'onRequestClose'> {
  title?: string;
  showCloseButton?: boolean;
  dismissOnOverlayPress?: boolean;
  className?: string;
  containerClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  onClose?: () => void;
  onOverlayPress?: () => void;
  onCloseIconPress?: (event: GestureResponderEvent) => void;
  children: React.ReactNode | ((props: { animateOut: (callback?: () => void) => void }) => React.ReactNode);
}

/**
 * ── POR QUÉ LA HOJA NO FUNCIONABA EN WEB ────────────────────────────────────
 * Medido en un navegador real sobre el paquete ya compilado. Eran dos fallos
 * distintos que se sumaban:
 *
 * 1. LAS CLASES SE PERDÍAN. Los dos `Animated.View` de abajo llevaban su
 *    maquetación en `className`, pero NativeWind no la aplica sobre los
 *    componentes de reanimated: en el DOM el elemento llegaba con la clase
 *    base y nada más. Se perdían `flex-1`, `items-center`, `justify-end` y
 *    `bg-black/50`, así que la capa de fondo ni ocupaba la pantalla, ni
 *    anclaba la hoja abajo, ni oscurecía nada (fondo medido: transparente).
 *
 * 2. LA ANIMACIÓN DE ENTRADA NO CORRÍA. `translateY` arrancaba en 300 y se
 *    quedaba ahí — medido `matrix(1, 0, 0, 1, 0, 300)` con la hoja abierta
 *    varios minutos. La hoja se dibujaba 300 px más abajo de donde debía.
 *
 * Juntos: la parte de abajo de la hoja quedaba FUERA de la pantalla. Ahí es
 * justo donde está "Añadir al carrito", así que el botón se veía pero el clic
 * no le llegaba (`elementFromPoint` sobre su centro devolvía null).
 *
 * Y como `onClose` se invocaba desde la función de término de `withTiming`,
 * que tampoco se ejecutaba, tocar fuera no cerraba nada. De ahí el "ni
 * siquiera salir".
 *
 * ── QUÉ SE HACE ─────────────────────────────────────────────────────────────
 * La maquetación pasa a `style`, que reanimated sí aplica. Y en web la hoja
 * aparece ya colocada, sin deslizamiento: el cierre llama a `onClose` directo
 * en lugar de esperar a que termine una animación que no se ejecuta. Deslizar
 * hacia arriba es un gesto de móvil que en un mostrador con ratón no aporta
 * nada; en móvil no cambia nada.
 */
const ES_WEB = Platform.OS === 'web';

/** Desplazamiento con el que la hoja entra deslizándose. En web, ninguno. */
const DESPLAZAMIENTO_ENTRADA = ES_WEB ? 0 : 300;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  title,
  children,
  showCloseButton = true,
  dismissOnOverlayPress = true,
  className,
  containerClassName,
  contentClassName,
  headerClassName,
  onClose,
  onOverlayPress,
  onCloseIconPress,
  ...modalProps
}) => {
  const safeAreaInsets = useSafeAreaInsets();
  const windowDimensions = useSafeAreaFrame();
  const keyboard = useKeyboard();

  const translateY = useSharedValue(DESPLAZAMIENTO_ENTRADA);
  const overlayOpacity = useSharedValue(ES_WEB ? 1 : 0);

  const handleClose = React.useCallback(() => {
    onClose?.();
  }, [onClose]);

  const animateIn = React.useCallback(() => {
    translateY.value = withTiming(0, { duration: 300 });
    overlayOpacity.value = withTiming(1, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateOut = React.useCallback(
    (callback?: () => void) => {
      if (ES_WEB) {
        // La función de término de withTiming no llega a ejecutarse en web, y
        // es de donde colgaba el cierre. Se llama directamente.
        callback?.();
        return;
      }

      translateY.value = withTiming(300, { duration: 250 });
      overlayOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
        if (finished && callback) {
          scheduleOnRN(callback);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const panGesture = Gesture.Pan()
    .onChange((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        const fadeOpacity = Math.max(0.3, 1 - event.translationY / 200);
        overlayOpacity.value = fadeOpacity;
      }
    })
    .onFinalize((event) => {
      const shouldClose = event.translationY > 100 || event.velocityY > 500;

      if (shouldClose) {
        if (Math.abs(event.velocityY) > 500) {
          translateY.value = withDecay({
            velocity: event.velocityY,
            clamp: [0, 300],
          });
          overlayOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
            if (finished) {
              scheduleOnRN(handleClose);
            }
          });
        } else {
          translateY.value = withTiming(300, { duration: 250 });
          overlayOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
            if (finished) {
              scheduleOnRN(handleClose);
            }
          });
        }
      } else {
        translateY.value = withSpring(0, { stiffness: 100, damping: 8 });
        overlayOpacity.value = withSpring(1, { stiffness: 100, damping: 8 });
      }
    });

  const overlayTapGesture = Gesture.Tap().onEnd(() => {
    if (dismissOnOverlayPress) {
      if (onOverlayPress) {
        return onOverlayPress();
      }
      animateOut(handleClose);
    }
  });

  // Animated styles
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Trigger animation when modal becomes visible
  React.useEffect(() => {
    if (modalProps.visible) {
      animateIn();
    }
  }, [modalProps.visible, animateIn]);

  const onRequestClose = React.useCallback<Exclude<ModalProps['onRequestClose'], undefined>>(
    (event) => {
      if (modalProps.onRequestClose) {
        return modalProps.onRequestClose(event);
      }
      onClose?.();
    },
    [modalProps, onClose],
  );

  const handleCloseIconPress = React.useCallback(
    (event: GestureResponderEvent) => {
      if (onCloseIconPress) {
        return onCloseIconPress(event);
      }
      animateOut(() => onClose?.());
    },
    [onClose, onCloseIconPress, animateOut],
  );

  return (
    <Modal
      transparent={true}
      statusBarTranslucent
      animationType="none"
      visible={modalProps.visible}
      onRequestClose={onRequestClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          className={className}
          style={[
            {
              // Va en style y no en className: NativeWind no aplica clases
              // sobre los componentes de reanimated y aquí se perdían todas.
              flex: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              paddingLeft: safeAreaInsets.left,
              paddingRight: safeAreaInsets.right,
            },
            overlayStyle,
          ]}
        >
          <GestureDetector gesture={overlayTapGesture}>
            <View className="absolute inset-0" />
          </GestureDetector>

          <View
            className="w-full flex-1"
            style={{
              paddingTop: safeAreaInsets.top,
            }}
            pointerEvents="none"
          >
            <View className="h-4 w-full" />
          </View>

          <Animated.View
            style={[
              {
                // Mismo motivo que arriba: por className no llegaba nada.
                width: '100%',
                flexShrink: 1,
                flexGrow: 0,
                maxHeight: windowDimensions.height - safeAreaInsets.bottom - safeAreaInsets.top - 16,
              },
              sheetStyle,
            ]}
          >
            <View
              className={clx('w-full shrink grow-0 overflow-hidden rounded-t-2xl bg-white', containerClassName)}
              style={{
                paddingBottom: keyboard.keyboardShown ? keyboard.keyboardHeight : 0,
              }}
            >
              <GestureDetector gesture={panGesture}>
                <View className="w-full shrink-0 grow-0 items-center py-2">
                  <View className="h-1 w-10 rounded-full bg-gray-200" />
                </View>
              </GestureDetector>

              {(title || showCloseButton) && (
                <View
                  className={clx('shrink-0 grow-0 flex-row items-center justify-between gap-2 p-4', headerClassName)}
                >
                  <View className="flex-1">{title && <Text>{title}</Text>}</View>
                  {showCloseButton && (
                    <TouchableOpacity onPress={handleCloseIconPress} accessibilityLabel="Cerrar">
                      <X size={20} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {!title && !showCloseButton && (
                <GestureDetector gesture={panGesture}>
                  <View className="h-8 shrink-0 grow-0" />
                </GestureDetector>
              )}

              <View className={clx('shrink grow-0 px-4', contentClassName)}>
                {typeof children === 'function' ? children({ animateOut }) : children}
              </View>
            </View>
            <Toast config={toastConfig} />
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};
