import i18n from "i18next";

/**
 * Traduce el vocabulario de tienda de Medusa al de una clínica.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 * El panel es el de Medusa, y Medusa es una plataforma de comercio: su menú
 * dice "Clientes" y "Grupos de Clientes", y sus pantallas hablan de "Crear
 * Cliente", "Eliminar Cliente" o "Este cliente no pertenece a ningún grupo".
 * Nuestras pantallas ya dicen "paciente" (ver VALIDACION.md §2.7 y §2.9), así
 * que las dos palabras convivían para la misma ficha con sólo cambiar de
 * sección.
 *
 * Son 86 textos y NO son nuestros: vienen dentro de `@medusajs/dashboard`.
 *
 * ── POR QUÉ SE HACE ASÍ Y NO EDITANDO EL PAQUETE ────────────────────────────
 * Las traducciones vienen ya compiladas dentro del paquete, así que no sirve
 * apuntar el build a otro archivo. Editar `node_modules` sí funcionaría, pero
 * se perdería en la siguiente instalación de dependencias, que es justo el tipo
 * de arreglo que desaparece sin avisar.
 *
 * Lo que sí es estable: el panel importa `i18next` como dependencia externa
 * —se comprobó en su código compilado— y está instalada una sola vez, así que
 * el panel y esta extensión comparten la MISMA instancia. Eso permite
 * reescribir los textos ya cargados con `addResourceBundle`, sin tocar el
 * paquete.
 *
 * ── CÓMO ────────────────────────────────────────────────────────────────────
 * No se mantiene una lista de 86 traducciones a mano —se quedaría desfasada en
 * cuanto Medusa añada una—, sino que se recorre lo que el panel haya cargado y
 * se sustituye la palabra. Lo que venga nuevo queda cubierto solo.
 *
 * Se cubre también el inglés porque es el idioma de respaldo: si a un texto le
 * falta la traducción al español, el panel enseña el original.
 *
 * ⚠️ Este módulo se importa por su EFECTO, sin usar nada de lo que exporta. Si
 * alguien "limpia" ese import, el menú vuelve a decir "Clientes".
 */

/** El panel agrupa todos sus textos bajo este espacio de nombres. */
const ESPACIO = "translation";

/**
 * Reglas por idioma. Se distingue mayúscula y plural para no estropear títulos
 * ni frases; el orden importa: primero el plural, si no "Clientes" acabaría
 * como "Pacientes" mal formado al aplicar antes la regla del singular.
 */
const REGLAS: Record<string, [RegExp, string][]> = {
    es: [
        [/\bClientes\b/g, "Pacientes"],
        [/\bclientes\b/g, "pacientes"],
        [/\bCliente\b/g, "Paciente"],
        [/\bcliente\b/g, "paciente"],
    ],
    en: [
        [/\bCustomers\b/g, "Patients"],
        [/\bcustomers\b/g, "patients"],
        [/\bCustomer\b/g, "Patient"],
        [/\bcustomer\b/g, "patient"],
    ],
};

function reescribirTexto(texto: string, reglas: [RegExp, string][]): string {
    return reglas.reduce((acc, [patron, reemplazo]) => acc.replace(patron, reemplazo), texto);
}

/**
 * Copia el árbol de textos cambiando la palabra. Devuelve `null` si no hubo
 * nada que cambiar, para no reescribir el paquete sin motivo.
 */
function reescribirArbol(nodo: any, reglas: [RegExp, string][]): { valor: any; cambio: boolean } {
    if (typeof nodo === "string") {
        const nuevo = reescribirTexto(nodo, reglas);
        return { valor: nuevo, cambio: nuevo !== nodo };
    }

    if (nodo && typeof nodo === "object" && !Array.isArray(nodo)) {
        const copia: Record<string, any> = {};
        let cambio = false;
        for (const clave of Object.keys(nodo)) {
            const r = reescribirArbol(nodo[clave], reglas);
            copia[clave] = r.valor;
            cambio = cambio || r.cambio;
        }
        return { valor: copia, cambio };
    }

    return { valor: nodo, cambio: false };
}

function aplicar() {
    for (const idioma of Object.keys(REGLAS)) {
        // Puede no estar cargado todavía: los textos llegan de forma asíncrona.
        const textos = i18n.getResourceBundle?.(idioma, ESPACIO);
        if (!textos) {
            continue;
        }

        const { valor, cambio } = reescribirArbol(textos, REGLAS[idioma]);
        if (cambio) {
            // `deep` y `overwrite`: se sustituyen los textos existentes en su sitio.
            i18n.addResourceBundle(idioma, ESPACIO, valor, true, true);
        }
    }
}

/**
 * Se engancha a los tres momentos en que puede haber textos nuevos. No se
 * escucha "added" a propósito: es el evento que dispara `addResourceBundle` y
 * escucharlo sería un bucle.
 */
if (i18n?.on) {
    i18n.on("initialized", aplicar);
    i18n.on("loaded", aplicar);
    i18n.on("languageChanged", aplicar);
}

if (i18n?.isInitialized) {
    aplicar();
}

export { aplicar as aplicarVocabularioClinico };
