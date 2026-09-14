import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * El documento HTML que envuelve la aplicación en web.
 *
 * ── POR QUÉ LA TIPOGRAFÍA SE CARGA AQUÍ Y NO CON `useFonts` ─────────────────
 * `expo-font` registra en web UNA FAMILIA POR ARCHIVO: cargar Inter en cinco
 * pesos daría cinco familias distintas ("Inter_300Light", "Inter_500Medium"…).
 * Eso obligaría a declararlas en `fontFamily` de Tailwind, y ahí las claves
 * chocan con las utilidades de peso: definir una familia `medium` genera
 * `font-medium`, que el propio Tailwind sobrescribe después. Los 73 `font-*`
 * que ya existen en el proyecto dejarían de hacer nada, sin ningún error.
 *
 * Con `@font-face` se declara UNA familia con cinco pesos, que es lo que el
 * sistema necesita: `font-sans` elige la familia y `font-light`/`font-medium`
 * eligen el peso, como en cualquier sitio web.
 *
 * ── POR QUÉ LOS ARCHIVOS SON NUESTROS ───────────────────────────────────────
 * Se sirven desde `public/fonts/`, no desde un CDN. Un mostrador de clínica se
 * queda sin red con más frecuencia de la que parece, y la tipografía no puede
 * depender de eso. `font-display: swap` hace que el texto se lea desde el primer
 * fotograma con la fuente del sistema y cambie al terminar de cargar.
 */
const TIPOGRAFIA = `
@font-face{font-family:'Inter';font-style:normal;font-weight:300;font-display:swap;src:url('/fonts/Inter_300Light.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url('/fonts/Inter_400Regular.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:500;font-display:swap;src:url('/fonts/Inter_500Medium.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url('/fonts/Inter_600SemiBold.ttf') format('truetype')}
@font-face{font-family:'Inter';font-style:normal;font-weight:700;font-display:swap;src:url('/fonts/Inter_700Bold.ttf') format('truetype')}
`;

/**
 * El lienzo se pinta también en el `body`. Sin esto, entre que carga el
 * documento y monta React se ve un destello blanco sobre el crema.
 */
const LIENZO = `body{background-color:#FDFCFC}`;

/**
 * El anillo de foco.
 *
 * Sin esto sale el del motor, que en WebKit es un dorado (#E59700) que no está
 * en la paleta. Se veía sobre todo en la pantalla de bloqueo, donde el campo
 * llega con `autoFocus` y el anillo aparece nada más entrar.
 *
 * ── POR QUÉ SON DOS ANILLOS Y NO UNO ────────────────────────────────────────
 * El azul del sistema no vale sobre las dos superficies a la vez. Medido:
 *
 *              sobre el lienzo   sobre la tinta
 *   acento-500      5.99:1           2.98:1   ← no llega al 3:1
 *   acento-300      3.04:1           5.86:1   ← justo, y al revés
 *
 * Ningún tono único pasa en las dos con holgura, y una regla de CSS no puede
 * mirar el fondo que tiene debajo. Así que se pinta primero una banda del color
 * del lienzo pegada al elemento y el azul se dibuja CONTRA esa banda: la pareja
 * es siempre 5.99:1, dé donde dé. Es el anillo doble que usa el propio Chrome.
 *
 * Se usa `:focus-visible`, no `:focus`, para que salga al llegar con el teclado
 * y no al tocar con el dedo. Sin `border-radius` propio: el contorno ya sigue
 * el del elemento, y fijarlo aquí cuadraría los campos redondeados.
 *
 * Los colores van escritos a mano porque esto es CSS en crudo, fuera del
 * alcance de Tailwind. Son `acento` y `lienzo` de `theme/tokens.js`.
 */
const FOCO = `
:focus-visible{outline:2px solid #2F5FB5;outline-offset:2px;box-shadow:0 0 0 2px #FDFCFC}
`;

/**
 * El autorrelleno del navegador.
 *
 * Chrome pinta los campos que rellena de azul claro, con un color que no es
 * nuestro y que además no se puede cambiar con `background-color`: hay que
 * taparlo con una sombra interior enorme y fijar el color del texto con
 * `-webkit-text-fill-color`. La transición de 9999s es el truco conocido para
 * que no vuelva a pintarlo al cabo de un momento.
 *
 * En el campo enfocado se escriben LAS DOS sombras: si sólo se pusiera la
 * interior, se perdería la banda del anillo de foco.
 *
 * ── Y EL ENGANCHE PARA JAVASCRIPT ───────────────────────────────────────────
 * El gestor de contraseñas escribe en el DOM sin pasar por React, así que el
 * formulario no se entera y el botón de enviar se queda apagado con la pantalla
 * llena. Chrome no dispara ningún evento propio para esto; el enganche estándar
 * es atar una animación vacía a `:-webkit-autofill`, porque aplicar ese estado
 * sí dispara `animationstart`. Lo escucha `components/form/TextField.tsx`.
 */
const AUTORRELLENO = `
@keyframes altus-autorrelleno{from{}to{}}
input:-webkit-autofill,input:-webkit-autofill:hover{
  -webkit-text-fill-color:#17150F;
  caret-color:#17150F;
  box-shadow:0 0 0 1000px #FFFFFF inset;
  transition:background-color 9999s ease-out 0s;
  animation-name:altus-autorrelleno;
}
input:-webkit-autofill:focus{
  -webkit-text-fill-color:#17150F;
  box-shadow:0 0 0 2px #FDFCFC,0 0 0 1000px #FFFFFF inset;
  transition:background-color 9999s ease-out 0s;
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Desactiva el desplazamiento del body en web, que es lo que espera el
          layout de React Native. Lo trae expo-router y no debe quitarse.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: TIPOGRAFIA }} />
        <style dangerouslySetInnerHTML={{ __html: LIENZO }} />
        <style dangerouslySetInnerHTML={{ __html: FOCO }} />
        <style dangerouslySetInnerHTML={{ __html: AUTORRELLENO }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
