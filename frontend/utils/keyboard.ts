import { Platform } from 'react-native';

/**
 * Modo de ocultado del teclado para las listas desplazables.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * En react-native-web, `keyboardDismissMode="on-drag"` hace que CADA evento de
 * scroll llame a `dismissKeyboard()`, que internamente ejecuta
 * `blurTextInput(currentlyFocusedField())`: quita el foco del campo de texto que
 * se esté usando en ese momento.
 *
 *   node_modules/react-native-web/dist/exports/ScrollView/index.js:244
 *   node_modules/react-native-web/dist/modules/dismissKeyboard/index.js
 *
 * FlashList v2 trae `maintainVisibleContentPosition` activado por omisión, así
 * que cuando cambian los datos ajusta el desplazamiento por su cuenta para no
 * mover lo que el usuario está viendo. Ese ajuste dispara el evento de scroll.
 *
 * La suma de ambas cosas es el fallo que reportó el tester: al teclear la
 * primera letra en el buscador, la consulta cambia, la lista se redibuja, se
 * desplaza sola, y el buscador pierde el foco. Hay que volver a hacer clic para
 * escribir la siguiente letra.
 *
 * ── POR QUÉ ASÍ ─────────────────────────────────────────────────────────────
 * En móvil el comportamiento SÍ es deseable: arrastrar la lista oculta el
 * teclado en pantalla y deja ver más resultados. Por eso no se elimina, se
 * desactiva sólo en web, donde no hay teclado que ocultar y el único efecto es
 * robarle el foco a quien está escribiendo.
 */
export const KEYBOARD_DISMISS_MODE = Platform.OS === 'web' ? 'none' : 'on-drag';
