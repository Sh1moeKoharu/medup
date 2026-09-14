import AsyncStorage from '@react-native-async-storage/async-storage';
import * as React from 'react';
import { useAuthCtx } from '@/contexts/auth';
import type { AdminCustomer } from '@medusajs/types';

/**
 * La receta que el médico o la enfermera está armando.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 * La vista médica del POS era una copia recortada del carrito del cajero, y
 * seguía usando el mecanismo de PEDIDOS EN BORRADOR del punto de venta para
 * guardar lo que el médico iba eligiendo. Dos consecuencias:
 *
 *  1. Esa ruta está restringida a Caja y Administración, con razón: es el
 *     carrito de una venta. Al médico le respondía 403 al asignar paciente.
 *  2. El botón "Procesar Orden" sólo borraba el identificador local del
 *     carrito. No se creaba NINGUNA orden médica: nada llegaba a la Bandeja
 *     de Farmacia, mientras el diálogo afirmaba lo contrario.
 *
 * Una receta no es una venta y no necesita un pedido en el servidor mientras
 * se redacta. Es un borrador LOCAL —paciente, renglones, notas— que se envía
 * UNA vez, entero, a POST /admin/medical-orders, que es la ruta que el área
 * médica sí puede usar y la que Farmacia lee.
 *
 * ── SE PERSISTE POR USUARIO ─────────────────────────────────────────────────
 * Recargar la página o cambiar de pestaña no debe perder una receta a medias.
 * Se guarda en el dispositivo bajo la clave del usuario, para que dos médicos
 * que comparten tableta no se pisen el borrador.
 */

export type RenglonReceta = {
  /** Identificador local del renglón, para la lista. */
  id: string;
  variant_id: string;
  product_id: string;
  product_title: string;
  quantity: number;
  /** Posología: "1 tableta cada 8 horas con alimentos". */
  instructions: string;
};

export type PacienteReceta = Pick<AdminCustomer, 'id' | 'email' | 'first_name' | 'last_name' | 'phone'>;

export type DestinatarioReceta = 'nursing' | 'pharmacy';

type EstadoReceta = {
  paciente: PacienteReceta | null;
  renglones: RenglonReceta[];
  notas: string;
  /** A quién va: Enfermería la aplica en consulta; Farmacia la surte en mostrador. */
  destinatario: DestinatarioReceta;
};

const VACIA: EstadoReceta = { paciente: null, renglones: [], notas: '', destinatario: 'nursing' };

type RecetaContexto = EstadoReceta & {
  /** Mientras se lee el borrador guardado. Evita pintar "vacío" un instante. */
  cargando: boolean;
  asignarPaciente: (p: PacienteReceta) => void;
  quitarPaciente: () => void;
  /** Añade una unidad; si el medicamento ya está, suma. */
  agregar: (m: { variant_id: string; product_id: string; product_title: string }, cantidad?: number) => void;
  cambiarCantidad: (id: string, quantity: number) => void;
  cambiarIndicaciones: (id: string, instructions: string) => void;
  quitar: (id: string) => void;
  cambiarNotas: (notas: string) => void;
  cambiarDestinatario: (destinatario: DestinatarioReceta) => void;
  vaciar: () => void;
  /** Cuántas unidades hay en total, para el distintivo de la pestaña. */
  totalUnidades: number;
};

const Contexto = React.createContext<RecetaContexto | null>(null);

const claveDe = (userId: string) => `altus.receta.${userId}`;

export const RecetaProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { state } = useAuthCtx();
  const userId = state.status === 'authenticated' ? state.user.id : null;

  const [estado, setEstado] = React.useState<EstadoReceta>(VACIA);
  const [cargando, setCargando] = React.useState(true);

  // ── Cargar el borrador del usuario ────────────────────────────────────────
  React.useEffect(() => {
    let vivo = true;

    if (!userId) {
      setEstado(VACIA);
      setCargando(false);
      return;
    }

    setCargando(true);
    AsyncStorage.getItem(claveDe(userId))
      .then((crudo) => {
        if (!vivo) return;
        if (!crudo) {
          setEstado(VACIA);
          return;
        }
        try {
          const guardado = JSON.parse(crudo) as Partial<EstadoReceta>;
          setEstado({
            paciente: guardado.paciente ?? null,
            renglones: Array.isArray(guardado.renglones) ? guardado.renglones : [],
            notas: typeof guardado.notas === 'string' ? guardado.notas : '',
            destinatario: guardado.destinatario === 'pharmacy' ? 'pharmacy' : 'nursing',
          });
        } catch {
          // Un borrador corrupto no debe impedir trabajar: se empieza de cero.
          setEstado(VACIA);
        }
      })
      .catch(() => {
        if (vivo) setEstado(VACIA);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [userId]);

  // ── Guardar en cada cambio ────────────────────────────────────────────────
  React.useEffect(() => {
    if (!userId || cargando) return;
    AsyncStorage.setItem(claveDe(userId), JSON.stringify(estado)).catch(() => undefined);
  }, [estado, userId, cargando]);

  const asignarPaciente = React.useCallback((p: PacienteReceta) => {
    setEstado((e) => ({
      ...e,
      paciente: { id: p.id, email: p.email, first_name: p.first_name, last_name: p.last_name, phone: p.phone },
    }));
  }, []);

  const quitarPaciente = React.useCallback(() => {
    setEstado((e) => ({ ...e, paciente: null }));
  }, []);

  const agregar = React.useCallback<RecetaContexto['agregar']>((m, cantidad = 1) => {
    setEstado((e) => {
      const existente = e.renglones.find((r) => r.variant_id === m.variant_id);
      if (existente) {
        return {
          ...e,
          renglones: e.renglones.map((r) =>
            r.id === existente.id ? { ...r, quantity: r.quantity + cantidad } : r,
          ),
        };
      }
      return {
        ...e,
        renglones: [
          ...e.renglones,
          {
            id: `${m.variant_id}-${Date.now()}`,
            variant_id: m.variant_id,
            product_id: m.product_id,
            product_title: m.product_title,
            quantity: cantidad,
            instructions: '',
          },
        ],
      };
    });
  }, []);

  const cambiarCantidad = React.useCallback((id: string, quantity: number) => {
    setEstado((e) => ({
      ...e,
      renglones: e.renglones.map((r) => (r.id === id ? { ...r, quantity: Math.max(1, quantity) } : r)),
    }));
  }, []);

  const cambiarIndicaciones = React.useCallback((id: string, instructions: string) => {
    setEstado((e) => ({
      ...e,
      renglones: e.renglones.map((r) => (r.id === id ? { ...r, instructions } : r)),
    }));
  }, []);

  const quitar = React.useCallback((id: string) => {
    setEstado((e) => ({ ...e, renglones: e.renglones.filter((r) => r.id !== id) }));
  }, []);

  const cambiarNotas = React.useCallback((notas: string) => {
    setEstado((e) => ({ ...e, notas }));
  }, []);

  const cambiarDestinatario = React.useCallback((destinatario: DestinatarioReceta) => {
    setEstado((e) => ({ ...e, destinatario }));
  }, []);

  const vaciar = React.useCallback(() => {
    setEstado(VACIA);
  }, []);

  const totalUnidades = React.useMemo(
    () => estado.renglones.reduce((s, r) => s + r.quantity, 0),
    [estado.renglones],
  );

  const valor = React.useMemo<RecetaContexto>(
    () => ({
      ...estado,
      cargando,
      asignarPaciente,
      quitarPaciente,
      agregar,
      cambiarCantidad,
      cambiarIndicaciones,
      quitar,
      cambiarNotas,
      cambiarDestinatario,
      vaciar,
      totalUnidades,
    }),
    [estado, cargando, asignarPaciente, quitarPaciente, agregar, cambiarCantidad, cambiarIndicaciones, quitar, cambiarNotas, cambiarDestinatario, vaciar, totalUnidades],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
};

export const useReceta = () => {
  const ctx = React.useContext(Contexto);
  if (!ctx) {
    throw new Error('useReceta debe usarse dentro de RecetaProvider');
  }
  return ctx;
};
