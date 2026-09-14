import { VARIABLES_TEMA } from "../tema-admin";

/**
 * Contraste del tema del panel.
 *
 * ── EL FALLO QUE ESTO CAZA ──────────────────────────────────────────────────
 * El botón principal del panel se pinta con `--button-inverted` de fondo y
 * `--contrast-fg-primary` de texto. Esa segunda variable es de Medusa y vale
 * BLANCO en los dos temas, porque su botón es oscuro en los dos. Al ponerlo
 * claro en el bloque oscuro salió blanco sobre gris claro: 1.4:1, el botón más
 * importante del panel ilegible, y en una captura pasa por «deshabilitado».
 *
 * El guardián del punto de venta (frontend/scripts/verificar-tokens.mjs) no
 * mira aquí: el panel es otro paquete y su paleta está duplicada a propósito.
 * Esto es su equivalente para el panel.
 */

/** Blanco que Medusa usa sobre los botones sólidos, ya compuesto sobre el fondo. */
const CONTRASTE_FG = "rgba(255,255,255,0.88)";

const aRgb = (color: string): [number, number, number] => {
  const hex = color.trim();
  if (hex.startsWith("#")) {
    const c = hex.slice(1);
    const largo = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
    return [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = hex.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Color que no se entiende: ${color}`);
  const partes = m[1].split(",").map((x) => Number(x.trim()));
  return [partes[0], partes[1], partes[2]];
};

/** Compone un color con alfa sobre un fondo opaco. */
const componer = (color: string, fondo: string): [number, number, number] => {
  const m = color.match(/rgba\(([^)]+)\)/);
  const alfa = m ? Number(m[1].split(",")[3]) : 1;
  const [r, g, b] = aRgb(color);
  const [fr, fg, fb] = aRgb(fondo);
  return [r * alfa + fr * (1 - alfa), g * alfa + fg * (1 - alfa), b * alfa + fb * (1 - alfa)];
};

const luminancia = ([r, g, b]: [number, number, number]): number => {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
};

/**
 * `superficie` es el color opaco de debajo. Hace falta porque en oscuro varios
 * fondos son blanco translúcido —`rgba(255,255,255,0.08)`—: medirlos como si
 * fueran blancos opacos daría un resultado sin relación con lo que se ve.
 */
const contraste = (frente: string, fondo: string, superficie = "#FFFFFF"): number => {
  const fondoOpaco = componer(fondo, superficie);
  const comoTexto = `rgb(${fondoOpaco.map(Math.round).join(",")})`;
  const a = luminancia(componer(frente, comoTexto));
  const b = luminancia(fondoOpaco);
  const [alto, bajo] = a > b ? [a, b] : [b, a];
  return (alto + 0.05) / (bajo + 0.05);
};

describe("tema del panel · contraste", () => {
  it("mide bien una pareja conocida", () => {
    expect(contraste("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contraste("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 2);
  });

  for (const tema of ["claro", "oscuro"] as const) {
    const v = VARIABLES_TEMA[tema];

    it(`${tema}: el texto blanco de Medusa se lee sobre el botón principal`, () => {
      for (const estado of ["", "-hover", "-pressed"]) {
        const fondo = v[`--button-inverted${estado}`];
        expect(contraste(CONTRASTE_FG, fondo)).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${tema}: el texto blanco se lee sobre el botón de peligro`, () => {
      for (const estado of ["", "-hover", "-pressed"]) {
        expect(contraste(CONTRASTE_FG, v[`--button-danger${estado}`])).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${tema}: el texto base se lee sobre el lienzo y sobre las tarjetas`, () => {
      expect(contraste(v["--fg-base"], v["--bg-subtle"])).toBeGreaterThanOrEqual(4.5);
      expect(contraste(v["--fg-base"], v["--bg-base"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: el texto secundario se lee sobre las tarjetas`, () => {
      expect(contraste(v["--fg-subtle"], v["--bg-base"])).toBeGreaterThanOrEqual(4.5);
      expect(contraste(v["--fg-muted"], v["--bg-base"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${tema}: cada distintivo de estado se lee sobre su tinte`, () => {
      for (const color of ["neutral", "green", "red", "blue", "orange", "purple"]) {
        expect(contraste(v[`--tag-${color}-text`], v[`--tag-${color}-bg`], v["--bg-base"])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
