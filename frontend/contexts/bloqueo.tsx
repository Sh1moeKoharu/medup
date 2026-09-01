import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { useAuthCtx } from '@/contexts/auth';

/**
 * Bloqueo de pantalla del punto de venta.
 *
 * ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
 * El cajero se va a comer. Hasta ahora la única salida era cerrar sesión, y eso
 * es demasiado: pierde el carrito a medias y obliga a reabrir el turno de caja,
 * con lo que el corte deja de cuadrar con la jornada real. Así que en la
 * práctica nadie cierra sesión, y la caja se queda abierta con el cajón al lado.
 *
 * Bloquear conserva TODO —sesión, turno de caja y carrito— y sólo pide la
 * contraseña para volver.
 *
 * ── POR QUÉ SE GUARDA EL ESTADO ─────────────────────────────────────────────
 * Si el bloqueo viviera sólo en memoria, recargar la página (F5) lo saltaría.
 * Se persiste, de modo que sigue bloqueado aunque alguien recargue o cierre y
 * reabra el navegador.
 *
 * ── QUÉ NO ES ───────────────────────────────────────────────────────────────
 * No sustituye a bloquear el equipo. Alguien con acceso físico puede cerrar el
 * navegador y hacer otras cosas en la máquina. Esto protege el punto de venta,
 * que es donde están el turno abierto y los datos del paciente.
 */

const CLAVE_BLOQUEO = 'altus.bloqueado';
const CLAVE_INACTIVIDAD = 'altus.bloqueo.minutos';

/** 0 = no bloquear por inactividad. */
export const MINUTOS_POR_OMISION = 0;

type BloqueoContexto = {
  bloqueado: boolean;
  cargando: boolean;
  minutosInactividad: number;
  bloquear: () => void;
  desbloquear: (password: string) => Promise<boolean>;
  registrarActividad: () => void;
  cambiarMinutos: (minutos: number) => void;
};

const Contexto = React.createContext<BloqueoContexto | null>(null);

export const BloqueoProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { state } = useAuthCtx();
  const [bloqueado, setBloqueado] = React.useState(false);
  const [cargando, setCargando] = React.useState(true);
  const [minutosInactividad, setMinutos] = React.useState(MINUTOS_POR_OMISION);
  const ultimaActividad = React.useRef(Date.now());

  // ── Estado guardado ───────────────────────────────────────────────────────
  React.useEffect(() => {
    let vivo = true;
    Promise.all([
      AsyncStorage.getItem(CLAVE_BLOQUEO).catch(() => null),
      AsyncStorage.getItem(CLAVE_INACTIVIDAD).catch(() => null),
    ]).then(([b, m]) => {
      if (!vivo) return;
      setBloqueado(b === '1');
      const n = Number(m);
      setMinutos(Number.isFinite(n) && n >= 0 ? n : MINUTOS_POR_OMISION);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const bloquear = React.useCallback(() => {
    setBloqueado(true);
    AsyncStorage.setItem(CLAVE_BLOQUEO, '1').catch(() => undefined);
  }, []);

  const cambiarMinutos = React.useCallback((m: number) => {
    setMinutos(m);
    AsyncStorage.setItem(CLAVE_INACTIVIDAD, String(m)).catch(() => undefined);
  }, []);

  const registrarActividad = React.useCallback(() => {
    ultimaActividad.current = Date.now();
  }, []);

  /**
   * Comprueba la contraseña contra el SERVIDOR, no contra nada guardado en el
   * dispositivo. Una comprobación local se saltaría editando el almacenamiento
   * del navegador.
   */
  const desbloquear = React.useCallback(
    async (password: string) => {
      const correo = state.status === 'authenticated' ? state.userEmail : null;
      const url = state.status === 'authenticated' ? state.medusaUrl : '';

      if (!correo || !password) return false;

      try {
        const res = await fetch(`${url}/auth/user/emailpass`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: correo, password }),
        });

        if (!res.ok) return false;

        setBloqueado(false);
        ultimaActividad.current = Date.now();
        AsyncStorage.removeItem(CLAVE_BLOQUEO).catch(() => undefined);
        return true;
      } catch {
        return false;
      }
    },
    [state],
  );

  // ── Bloqueo por inactividad ───────────────────────────────────────────────
  // Se revisa cada 30 s en lugar de programar un temporizador por cada toque:
  // con un temporizador por interacción, una pantalla muy usada estaría
  // creándolos y cancelándolos sin parar.
  React.useEffect(() => {
    if (minutosInactividad <= 0 || bloqueado) return;

    const id = setInterval(() => {
      const inactivo = (Date.now() - ultimaActividad.current) / 60000;
      if (inactivo >= minutosInactividad) {
        bloquear();
      }
    }, 30000);

    return () => clearInterval(id);
  }, [minutosInactividad, bloqueado, bloquear]);

  const valor = React.useMemo(
    () => ({
      bloqueado,
      cargando,
      minutosInactividad,
      bloquear,
      desbloquear,
      registrarActividad,
      cambiarMinutos,
    }),
    [bloqueado, cargando, minutosInactividad, bloquear, desbloquear, registrarActividad, cambiarMinutos],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
};

export const useBloqueo = () => {
  const ctx = React.useContext(Contexto);
  if (!ctx) {
    throw new Error('useBloqueo debe usarse dentro de BloqueoProvider');
  }
  return ctx;
};
