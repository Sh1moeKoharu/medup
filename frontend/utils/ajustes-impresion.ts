import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';

/**
 * Preferencias de impresión, guardadas EN CADA DISPOSITIVO.
 *
 * ── POR QUÉ AQUÍ Y NO EN EL SERVIDOR ────────────────────────────────────────
 * Son propias del equipo: la PC del mostrador tiene la térmica conectada y
 * debe imprimir sola en cada venta, mientras que una tableta que sólo consulta
 * no tiene impresora y no debe intentarlo. Si esto viviera en el servidor,
 * todas las cajas compartirían la misma configuración.
 *
 * ── LO QUE NO SE PUEDE CONFIGURAR AQUÍ ──────────────────────────────────────
 * CUÁL impresora se usa. Ningún navegador permite que una página vea la lista
 * de impresoras del equipo ni elija una: es una restricción de seguridad, no
 * una carencia de esta aplicación. El ticket sale por la impresora
 * PREDETERMINADA de Windows, y eso se elige en Windows.
 *
 * Para que además no aparezca el diálogo de impresión hay que abrir el punto
 * de venta con Chrome en modo de impresión directa (--kiosk-printing). Ver el
 * texto de ayuda en app/settings/impresion.tsx, que es donde el usuario lo va
 * a buscar.
 */

const CLAVE = 'altus.impresion';

export type AjustesImpresion = {
  /** Imprime el ticket solo al terminar la venta, sin que nadie pulse nada. */
  automatico: boolean;
};

export const AJUSTES_POR_OMISION: AjustesImpresion = {
  // Encendido por omisión desde que la clínica lo pidió: «Completar orden» abre
  // la impresión del recibo directamente, sin pasar por un diálogo con botones.
  // En un equipo sin impresora se apaga aquí y vuelve el diálogo.
  automatico: true,
};

export async function leerAjustesImpresion(): Promise<AjustesImpresion> {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    if (!crudo) return AJUSTES_POR_OMISION;
    const guardado = JSON.parse(crudo);
    return { ...AJUSTES_POR_OMISION, ...guardado };
  } catch {
    // Almacenamiento no disponible o dato corrupto: se sigue con lo por omisión
    // en lugar de dejar la pantalla rota.
    return AJUSTES_POR_OMISION;
  }
}

export async function guardarAjustesImpresion(ajustes: AjustesImpresion): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE, JSON.stringify(ajustes));
  } catch {
    // Sin almacenamiento no se puede recordar la preferencia; no es motivo para
    // interrumpir al cajero.
  }
}

/** Lee las preferencias y las mantiene en estado. */
export function useAjustesImpresion() {
  const [ajustes, setAjustes] = React.useState<AjustesImpresion>(AJUSTES_POR_OMISION);
  const [cargando, setCargando] = React.useState(true);

  React.useEffect(() => {
    let vivo = true;
    leerAjustesImpresion().then((a) => {
      if (vivo) {
        setAjustes(a);
        setCargando(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  const actualizar = React.useCallback(async (cambio: Partial<AjustesImpresion>) => {
    setAjustes((previo) => {
      const nuevo = { ...previo, ...cambio };
      guardarAjustesImpresion(nuevo);
      return nuevo;
    });
  }, []);

  return { ajustes, cargando, actualizar };
}
