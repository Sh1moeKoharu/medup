/**
 * Tipos de `tokens.js`. El módulo está en CommonJS porque lo carga
 * `tailwind.config.js` con `require()`; esto le da tipado al importarlo desde
 * TypeScript.
 */

export interface ColoresDelSistema {
  lienzo: string;
  superficie: string;
  tarjeta: string;
  tinta: string;

  textoPrimario: string;
  textoSecundario: string;
  textoTerciario: string;
  textoSobreTinta: string;

  borde: string;
  bordeFuerte: string;
  bordeFoco: string;

  pestanaActiva: string;
  pestanaInactiva: string;

  velo: string;

  iconoSuave: string;
  iconoNeutro: string;
  iconoExito: string;
  iconoAviso: string;
  iconoError: string;
  iconoInfo: string;

  acento: string;
}

type EscalonesNeutros = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type EscalonesSemanticos = 200 | 300 | 500 | 700;

export interface PaletaTailwind {
  transparent: string;
  white: string;
  black: string;
  canvas: string;
  surface: string;
  gray: Record<EscalonesNeutros, string>;
  primary: Record<EscalonesSemanticos, string>;
  active: Record<EscalonesSemanticos, string>;
  success: Record<EscalonesSemanticos, string>;
  warning: Record<EscalonesSemanticos, string>;
  error: Record<EscalonesSemanticos, string>;
  info: Record<EscalonesSemanticos, string>;
}

export interface Tipografia {
  familia: string[];
  escala: Record<string, [string, { lineHeight: string; fontWeight: string; letterSpacing?: string }]>;
}

export declare const color: ColoresDelSistema;
export declare const paletaTailwind: PaletaTailwind;
export declare const tipografia: Tipografia;
export declare const radio: Record<string, string>;
export declare const sombra: Record<string, string>;
