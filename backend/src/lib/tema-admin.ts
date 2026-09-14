/**
 * Tema de Altus para el panel de administración.
 *
 * ── POR QUÉ ESTO ES UN BLOQUE DE CSS Y NO UNA CONFIGURACIÓN ─────────────────
 * El panel es el de Medusa y no ofrece ningún punto de extensión de tema: no
 * acepta un archivo CSS propio —el empaquetador regenera el suyo en cada
 * compilación— ni lee el `tailwind.config` del proyecto.
 *
 * Lo que sí tiene es un sistema de ~113 variables CSS declaradas en `:root` y
 * en `.dark`, y TODAS sus utilidades (`bg-ui-bg-base`, `text-ui-fg-muted`…) son
 * simples alias de esas variables. Redefinirlas recolorea el panel entero
 * —incluidas las pantallas que no escribimos nosotros, como Pedidos o
 * Productos— sin tocar un solo componente.
 *
 * Se inyecta desde `medusa-config.ts`, con el mismo mecanismo que ya se usa
 * para el idioma, la URL del POS, el menú y el botón de salir.
 *
 * ── LO QUE NO SE PUEDE ──────────────────────────────────────────────────────
 * No existe ninguna variable de radio: los redondeos del panel son clases
 * compiladas. Forzarlos exigiría pisar selectores concretos de Medusa, que es
 * exactamente el tipo de arreglo que se rompe en la siguiente actualización. Se
 * deja como está.
 *
 * ⚠️ La paleta está duplicada aquí a propósito: `frontend/theme/tokens.js` es de
 * otro paquete npm y el panel no puede importarlo. Si cambia una, cambia la
 * otra. Es el mismo trato que ya tiene el vocabulario de roles.
 */

// ── Paleta (espejo de frontend/theme/tokens.js) ─────────────────────────────
const LIENZO = "#FDFCFC";
const SUPERFICIE = "#F5F3F1";
const TARJETA = "#FFFFFF";
const TINTA = "#17150F";

const gris = {
    50: "#FAF9F7",
    100: "#F5F3F1",
    200: "#EBE8E4",
    250: "#B3ADA4", // sólo panel: texto deshabilitado y borde fuerte
    300: "#6F6960",
    400: "#5C574F",
    500: "#4A453E",
    700: "#2E2B25",
};

const acento = { 200: "#E4EBF8", 300: "#C2D2EE", 500: "#2F5FB5", 700: "#264C91" };
const exito = { 200: "#E4F3E6", 300: "#C6E2CC", 500: "#2E6B3A" };
const error = { 200: "#FCE9E9", 300: "#F2C9C9", 500: "#B4232B", 700: "#921C23" };
const aviso = { 200: "#FDF3D9", 300: "#F6DFA6", 500: "#8A6410" };
// Medusa usa etiquetas moradas en sitios que no controlamos. Se le da un tono
// propio para que sigan distinguiéndose del azul.
const violeta = { 200: "#EEE9F7", 300: "#DCD2EF", 500: "#5B3E96" };

// Oscuro: mismos papeles, en negativo y en cálido. Los bordes y campos van con
// blanco translúcido, como hace Medusa, para que no se despeguen del fondo.
const oscuro = {
    lienzo: "#141311",
    base: "#1C1A17",
    componente: "#232019",
    tinta: "#F5F3F1",
    textoSuave: "#C9C3BA",
    textoApagado: "#A29B92",
    textoInerte: "#6F6960",
};

function bloque(variables: Record<string, string>): string {
    return Object.entries(variables)
        .map(([k, v]) => `${k}:${v};`)
        .join("");
}

/** Claro. */
const CLARO: Record<string, string> = {
    // Fondos. `--bg-subtle` es el lienzo de la aplicación y `--bg-base` la
    // superficie de tarjetas y tablas: blanco sobre crema, igual que el POS.
    "--bg-base": TARJETA,
    "--bg-base-hover": gris[50],
    "--bg-base-pressed": SUPERFICIE,
    "--bg-subtle": LIENZO,
    "--bg-subtle-hover": SUPERFICIE,
    "--bg-subtle-pressed": gris[200],
    "--bg-component": gris[50],
    "--bg-component-hover": SUPERFICIE,
    "--bg-component-pressed": gris[200],
    "--bg-field": gris[50],
    "--bg-field-hover": SUPERFICIE,
    "--bg-field-component": TARJETA,
    "--bg-field-component-hover": gris[50],
    "--bg-disabled": SUPERFICIE,
    "--bg-highlight": acento[200],
    "--bg-highlight-hover": acento[300],
    "--bg-interactive": acento[500],
    "--bg-overlay": "rgba(23, 21, 15, 0.45)",

    // Texto.
    "--fg-base": TINTA,
    "--fg-subtle": gris[500],
    "--fg-muted": gris[400],
    "--fg-disabled": gris[250],
    "--fg-on-color": TARJETA,
    "--fg-on-inverted": TARJETA,
    "--fg-error": error[500],
    "--fg-interactive": acento[500],
    "--fg-interactive-hover": acento[700],

    // Bordes.
    "--border-base": gris[200],
    "--border-strong": gris[250],
    "--border-interactive": acento[500],
    "--border-error": error[500],
    "--border-danger": error[700],

    // Botones sólidos.
    "--button-inverted": TINTA,
    "--button-inverted-hover": gris[700],
    "--button-inverted-pressed": gris[500],
    "--button-neutral": TARJETA,
    "--button-neutral-hover": gris[50],
    "--button-neutral-pressed": SUPERFICIE,
    "--button-danger": error[500],
    "--button-danger-hover": error[700],
    "--button-danger-pressed": error[700],

    // Etiquetas: es lo que dibuja los distintivos de estado de todas las tablas.
    "--tag-neutral-bg": SUPERFICIE,
    "--tag-neutral-bg-hover": gris[200],
    "--tag-neutral-border": gris[200],
    "--tag-neutral-text": gris[500],
    "--tag-neutral-icon": gris[400],
    "--tag-green-bg": exito[200],
    "--tag-green-bg-hover": exito[300],
    "--tag-green-border": exito[300],
    "--tag-green-text": exito[500],
    "--tag-green-icon": exito[500],
    "--tag-red-bg": error[200],
    "--tag-red-bg-hover": error[300],
    "--tag-red-border": error[300],
    "--tag-red-text": error[500],
    "--tag-red-icon": error[500],
    "--tag-blue-bg": acento[200],
    "--tag-blue-bg-hover": acento[300],
    "--tag-blue-border": acento[300],
    "--tag-blue-text": acento[500],
    "--tag-blue-icon": acento[500],
    "--tag-orange-bg": aviso[200],
    "--tag-orange-bg-hover": aviso[300],
    "--tag-orange-border": aviso[300],
    "--tag-orange-text": aviso[500],
    "--tag-orange-icon": aviso[500],
    "--tag-purple-bg": violeta[200],
    "--tag-purple-bg-hover": violeta[300],
    "--tag-purple-border": violeta[300],
    "--tag-purple-text": violeta[500],
    "--tag-purple-icon": violeta[500],

    // Elevación: una sombra suave y difusa, no un borde duro.
    "--elevation-card-rest": "0px 0px 0px 1px rgba(23,21,15,0.06), 0px 2px 8px 0px rgba(23,21,15,0.05)",
    "--elevation-card-hover": "0px 0px 0px 1px rgba(23,21,15,0.08), 0px 4px 12px 0px rgba(23,21,15,0.08)",

    // Anillo de foco, para que sea el azul de Altus y no el de Medusa.
    "--borders-focus": `0px 0px 0px 1px ${TARJETA}, 0px 0px 0px 3px rgba(47,95,181,0.5)`,
};

/** Oscuro. Mismos papeles, en negativo. */
const OSCURO: Record<string, string> = {
    "--bg-base": oscuro.base,
    "--bg-base-hover": oscuro.componente,
    "--bg-base-pressed": "#2A2620",
    "--bg-subtle": oscuro.lienzo,
    "--bg-subtle-hover": oscuro.base,
    "--bg-subtle-pressed": oscuro.componente,
    "--bg-component": oscuro.componente,
    "--bg-component-hover": "#2A2620",
    "--bg-component-pressed": "#332F28",
    "--bg-field": "rgba(255, 255, 255, 0.04)",
    "--bg-field-hover": "rgba(255, 255, 255, 0.08)",
    "--bg-field-component": oscuro.base,
    "--bg-field-component-hover": oscuro.componente,
    "--bg-disabled": oscuro.componente,
    "--bg-highlight": "#17233D",
    "--bg-highlight-hover": "#1E2E4E",
    "--bg-interactive": acento[500],
    "--bg-overlay": "rgba(10, 9, 8, 0.72)",

    "--fg-base": oscuro.tinta,
    "--fg-subtle": oscuro.textoSuave,
    "--fg-muted": oscuro.textoApagado,
    "--fg-disabled": oscuro.textoInerte,
    "--fg-on-color": TARJETA,
    "--fg-on-inverted": TINTA,
    "--fg-error": "#F08A8F",
    "--fg-interactive": "#8FB3E8",
    "--fg-interactive-hover": "#B3CCF0",

    "--border-base": "rgba(255, 255, 255, 0.08)",
    "--border-strong": "rgba(255, 255, 255, 0.16)",
    "--border-interactive": "#8FB3E8",
    "--border-error": "#C4525A",
    "--border-danger": "#A33840",

    /**
     * El botón principal se pinta con `--button-inverted` de fondo y
     * `--contrast-fg-primary` de texto, que Medusa deja BLANCO en los dos
     * temas. Ponerlo claro aquí dejaba blanco sobre gris claro —1.4:1, el botón
     * más importante del panel ilegible—. Va oscuro, como el de Medusa, pero
     * un escalón por encima del lienzo para que se vea como botón.
     */
    "--button-inverted": "#3A352E",
    "--button-inverted-hover": "#474137",
    "--button-inverted-pressed": "#2E2A24",
    "--button-neutral": "rgba(255, 255, 255, 0.04)",
    "--button-neutral-hover": "rgba(255, 255, 255, 0.08)",
    "--button-neutral-pressed": "rgba(255, 255, 255, 0.12)",
    "--button-danger": "#9E2A31",
    "--button-danger-hover": "#B4232B",
    "--button-danger-pressed": "#7A1F25",

    "--tag-neutral-bg": "rgba(255, 255, 255, 0.08)",
    "--tag-neutral-bg-hover": "rgba(255, 255, 255, 0.12)",
    "--tag-neutral-border": "rgba(255, 255, 255, 0.12)",
    "--tag-neutral-text": oscuro.textoSuave,
    "--tag-neutral-icon": oscuro.textoApagado,
    "--tag-green-bg": "#12301C",
    "--tag-green-bg-hover": "#193F26",
    "--tag-green-border": "#1F4B2D",
    "--tag-green-text": "#7FC98E",
    "--tag-green-icon": "#7FC98E",
    "--tag-red-bg": "#3A1417",
    "--tag-red-bg-hover": "#4A191D",
    "--tag-red-border": "#5A1F24",
    "--tag-red-text": "#F0949A",
    "--tag-red-icon": "#F0949A",
    "--tag-blue-bg": "#152743",
    "--tag-blue-bg-hover": "#1C3357",
    "--tag-blue-border": "#234067",
    "--tag-blue-text": "#9CBCEC",
    "--tag-blue-icon": "#9CBCEC",
    "--tag-orange-bg": "#3A2A0D",
    "--tag-orange-bg-hover": "#4A3611",
    "--tag-orange-border": "#5A4215",
    "--tag-orange-text": "#E5BC63",
    "--tag-orange-icon": "#E5BC63",
    "--tag-purple-bg": "#241C3A",
    "--tag-purple-bg-hover": "#2E2449",
    "--tag-purple-border": "#392D5A",
    "--tag-purple-text": "#B8A6E0",
    "--tag-purple-icon": "#B8A6E0",

    "--elevation-card-rest": "0px 0px 0px 1px rgba(255,255,255,0.06), 0px 2px 8px 0px rgba(0,0,0,0.4)",
    "--elevation-card-hover": "0px 0px 0px 1px rgba(255,255,255,0.1), 0px 4px 12px 0px rgba(0,0,0,0.5)",

    "--borders-focus": `0px 0px 0px 1px ${oscuro.base}, 0px 0px 0px 3px rgba(143,179,232,0.5)`,
};

/**
 * El CSS listo para inyectar.
 *
 * ⚠️ Va DESPUÉS del CSS del panel en el `<head>`, así gana por orden de
 * aparición con la misma especificidad. En `medusa develop` el recargado en
 * caliente inyecta su CSS más tarde y puede pisarlo: la apariencia se valida
 * siempre contra el panel compilado (`npm run dev:panel`).
 *
 * No se sube la especificidad con `html:root` porque `.dark` quedaría por
 * debajo del claro y el modo oscuro dejaría de funcionar.
 */
export const VARIABLES_TEMA = { claro: CLARO, oscuro: OSCURO };

export const CSS_TEMA_ADMIN = `<style data-altus-tema>:root{${bloque(CLARO)}}.dark{${bloque(OSCURO)}}</style>`;
