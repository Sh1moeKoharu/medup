import type { OrdenMedica } from '@/api/hooks/medical-orders';
import { prepararAlertaSonora, sonarAlerta } from '@/utils/alerta-sonora';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import Toast from 'react-native-toast-message';

/**
 * Avisa cuando llega una orden nueva a la bandeja: aviso en pantalla, sonido
 * si la persona lo aceptó, y la orden marcada como «Nueva» hasta que la abra.
 *
 * ── QUÉ CUENTA COMO NUEVA ───────────────────────────────────────────────────
 * Lo que ya estaba en la bandeja al abrir la pantalla NO es nuevo: si sonara
 * por eso, cada mañana empezaría con una alarma por cada orden de ayer. Nueva
 * es la que aparece en una actualización posterior a la primera.
 *
 * ── EL SONIDO SE PREGUNTA UNA VEZ ───────────────────────────────────────────
 * El navegador no deja sonar nada sin que la persona haya tocado la página, y
 * un aviso que se repite acaba ignorado. Así que se pregunta una sola vez, la
 * respuesta se guarda en el equipo y se puede cambiar desde la propia bandeja.
 * Mientras no se haya contestado, `preferencia` es null y la pantalla enseña
 * la pregunta.
 */

const CLAVE_PREFERENCIA = 'bandeja.alertaSonora';

export type PreferenciaSonido = 'si' | 'no' | null;

export function useAvisoDeBandeja(ordenes: OrdenMedica[] | undefined, cargada: boolean) {
  const [preferencia, setPreferencia] = React.useState<PreferenciaSonido | 'cargando'>('cargando');
  const vistas = React.useRef<Set<string> | null>(null);
  const [nuevas, setNuevas] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    let cancelado = false;
    AsyncStorage.getItem(CLAVE_PREFERENCIA)
      .then((v) => {
        if (cancelado) return;
        setPreferencia(v === '1' ? 'si' : v === '0' ? 'no' : null);
        if (v === '1') prepararAlertaSonora();
      })
      .catch(() => {
        if (!cancelado) setPreferencia(null);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const decidir = React.useCallback((conSonido: boolean) => {
    setPreferencia(conSonido ? 'si' : 'no');
    // Desde el botón: es el gesto que el navegador exige para poder sonar.
    if (conSonido) prepararAlertaSonora();
    AsyncStorage.setItem(CLAVE_PREFERENCIA, conSonido ? '1' : '0').catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!cargada || !ordenes) return;
    const ids = new Set(ordenes.map((o) => o.id));

    // Primera carga: se toma nota y no se avisa de nada.
    if (vistas.current === null) {
      vistas.current = ids;
      return;
    }

    const llegadas = ordenes.filter((o) => !vistas.current!.has(o.id));
    vistas.current = ids;
    if (llegadas.length === 0) return;

    setNuevas((previas) => {
      const siguiente = new Set(previas);
      llegadas.forEach((o) => siguiente.add(o.id));
      return siguiente;
    });

    const nombre = llegadas[0].customer_name ?? 'un paciente';
    Toast.show({
      type: 'info',
      text1: llegadas.length === 1 ? `Orden nueva: ${nombre}` : `${llegadas.length} órdenes nuevas`,
      text2: llegadas.length === 1 ? `De ${llegadas[0].creator_name ?? 'el médico'}. Ya está en la Bandeja.` : 'Ya están en la Bandeja.',
    });
    if (preferencia === 'si') void sonarAlerta();
  }, [ordenes, cargada, preferencia]);

  const marcarVista = React.useCallback((id: string) => {
    setNuevas((previas) => {
      if (!previas.has(id)) return previas;
      const siguiente = new Set(previas);
      siguiente.delete(id);
      return siguiente;
    });
  }, []);

  return { preferencia, decidir, nuevas, marcarVista };
}
