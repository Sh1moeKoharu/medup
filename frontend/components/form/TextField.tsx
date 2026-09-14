import { CircleAlert } from '@/components/icons/circle-alert';
import { Eye } from '@/components/icons/eye';
import { EyeOff } from '@/components/icons/eye-off';
import { InfoBanner } from '@/components/InfoBanner';
import { clx } from '@/utils/clx';
import React, { useEffect, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Platform, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, tipografia } from '@/theme/tokens';

/**
 * Medidas de la etiqueta flotante.
 *
 * ── POR QUÉ ESTÁN AQUÍ Y NO EN UNA CLASE ────────────────────────────────────
 * La etiqueta es un `Animated.Text` de reanimated, y NativeWind no estiliza los
 * componentes de reanimated: el `className` que llevaba antes no aplicaba nada.
 * Se comprobó sobre la página: salía en negro y a 14 px, cuando la clase pedía
 * `text-gray-300` y 16 px, y encima quedaba por encima del campo en vez de
 * dentro, porque sin `top` el elemento absoluto caía en su posición estática.
 * Así que va todo por `style`, con valores del sistema.
 *
 * Los números se derivan del propio campo, no se tantean:
 *   · el campo lleva `pt-6 pb-2`, así que su texto empieza a 24 px del borde
 *   · la etiqueta en reposo se pone justo ahí, encima de donde va a escribirse
 *   · al flotar sube 17 px y se queda en 7, dentro del relleno superior
 *   · `left` son los 12 px de relleno lateral más 1 px de borde
 */
const ARRANQUE_TEXTO = 24;
const ALTO_SUBIDA = 17;
const ESCALA_FLOTANTE = 0.75;
const SANGRIA = 13;

interface TextFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  name: string;
  placeholder?: string;
  floatingPlaceholder?: boolean;
  className?: string;
  inputClassName?: string;
  errorClassName?: string;
  errorVariation?: 'default' | 'inline';
}

export function TextField({
  name,
  placeholder,
  floatingPlaceholder = false,
  className = '',
  inputClassName = '',
  errorClassName = '',
  errorVariation = 'default',
  secureTextEntry,
  ...textInputProps
}: TextFieldProps) {
  const { control } = useFormContext();
  const {
    field: { onChange, onBlur, value },
    fieldState: { error },
  } = useController({
    name,
    control,
  });

  const [isFocused, setIsFocused] = useState(false);
  const [showValue, setShowValue] = useState(false);

  /**
   * El autorrelleno del gestor de contraseñas.
   *
   * ── EL FALLO QUE ARREGLA ────────────────────────────────────────────────
   * El navegador escribe directamente en el DOM, sin pasar por React, así que
   * `onChangeText` no se dispara nunca. El formulario sigue creyendo que el
   * campo está vacío, `formState.isValid` se queda en falso y `FormButton`
   * deja el botón apagado: la pantalla se ve llena y no se puede entrar. Pasa
   * en el inicio de sesión, que es justo donde todo el mundo usa el gestor.
   *
   * Chrome no expone ningún evento para esto. El enganche estándar es la
   * animación vacía que `app/+html.tsx` ata a `:-webkit-autofill`: aplicar ese
   * estado sí dispara `animationstart`, y ahí ya se puede leer el valor. Se
   * comprueba además una vez al montar, porque el relleno que ocurre al cargar
   * la página puede haber sucedido antes de que este efecto exista.
   *
   * Sólo web. En nativo el `ref` no es un nodo del DOM y la guarda lo descarta.
   */
  const refNodo = React.useRef<unknown>(null);
  const valorActual = React.useRef(value);
  valorActual.current = value;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const nodo = refNodo.current as HTMLInputElement | null;
    if (!nodo || typeof nodo.addEventListener !== 'function') return;

    const sincronizar = () => {
      const rellenado = nodo.value;
      if (rellenado && rellenado !== valorActual.current) onChange(rellenado);
    };
    const alAnimar = (e: Event) => {
      if ((e as AnimationEvent).animationName === 'altus-autorrelleno') sincronizar();
    };

    nodo.addEventListener('animationstart', alAnimar);
    nodo.addEventListener('change', sincronizar);
    const alMontar = setTimeout(sincronizar, 200);

    return () => {
      nodo.removeEventListener('animationstart', alAnimar);
      nodo.removeEventListener('change', sincronizar);
      clearTimeout(alMontar);
    };
  }, [onChange]);

  const showFloating = isFocused || !!value;
  const floatingPlaceholderTranslateY = useSharedValue(0);
  const floatingPlaceholderScale = useSharedValue(1);

  const floatingPlaceholderStyle = useAnimatedStyle(() => {
    return {
      transformOrigin: 'top left',
      transform: [
        {
          translateY: floatingPlaceholderTranslateY.value,
        },
        {
          scale: floatingPlaceholderScale.value,
        },
      ],
    };
  });

  useEffect(() => {
    if (showFloating) {
      floatingPlaceholderTranslateY.value = withTiming(-ALTO_SUBIDA, { duration: 150 });
      floatingPlaceholderScale.value = withTiming(ESCALA_FLOTANTE, { duration: 150 });
    } else {
      floatingPlaceholderTranslateY.value = withTiming(0, { duration: 150 });
      floatingPlaceholderScale.value = withTiming(1, { duration: 150 });
    }
  }, [floatingPlaceholderScale, floatingPlaceholderTranslateY, showFloating]);

  return (
    <View className={className}>
      <View className="relative justify-center">
        {floatingPlaceholder && (
          <Animated.Text
            style={[
              {
                position: 'absolute',
                left: SANGRIA,
                top: ARRANQUE_TEXTO,
                zIndex: 10,
                fontSize: 16,
                lineHeight: 22,
                color: error ? color.iconoError : color.textoTerciario,
                ...(Platform.OS === 'web' ? { fontFamily: tipografia.familia.join(', ') } : null),
              },
              floatingPlaceholderStyle,
            ]}
            pointerEvents="none"
          >
            {placeholder}
          </Animated.Text>
        )}
        <TextInput
          ref={(n) => {
            refNodo.current = n;
          }}
          className={clx(
            // El borde va a `gray-300`, no al filete de tarjeta: `gray-200` es
            // demasiado tenue para delimitar algo donde hay que escribir, y en
            // el inicio de sesión el campo se veía prácticamente sin contorno.
            'rounded-xl border border-gray-300 bg-white px-3 py-4 focus:border-active-500',
            {
              '!border-error-500': error,
              'pb-2 pt-6': floatingPlaceholder,
              'pr-9': error && errorVariation === 'inline',
            },
            inputClassName,
          )}
          placeholder={floatingPlaceholder ? undefined : placeholder}
          placeholderTextColor={color.textoTerciario}
          value={value || ''}
          secureTextEntry={secureTextEntry && !showValue}
          onChangeText={onChange}
          onBlur={() => {
            setIsFocused(false);
            onBlur();
          }}
          onFocus={() => setIsFocused(true)}
          {...textInputProps}
        />
        {secureTextEntry && (
          <TouchableOpacity className="absolute right-2 p-1" onPress={() => setShowValue(!showValue)}>
            {showValue ? (
              <Eye size={16} className={error ? 'text-error-500' : 'text-gray-300'} />
            ) : (
              <EyeOff size={16} className={error ? 'text-error-500' : 'text-gray-300'} />
            )}
          </TouchableOpacity>
        )}
        {error && errorVariation === 'inline' && (
          <View className="absolute right-3">
            <CircleAlert size={16} color={color.iconoError} />
          </View>
        )}
      </View>
      {error && errorVariation === 'default' && (
        <InfoBanner
          colorScheme="error"
          variant="ghost"
          className={clx('mt-2 gap-1', errorClassName)}
          textClassName="text-2xs"
        >
          {error.message}
        </InfoBanner>
      )}
    </View>
  );
}
