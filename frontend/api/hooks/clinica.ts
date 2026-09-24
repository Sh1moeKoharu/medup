import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { imprimirHtml } from '@/utils/imprimir';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { OrdenMedica } from './medical-orders';

/**
 * El circuito clínico: la bandeja de Enfermería, el ajuste y la aplicación de
 * una orden, las notas de atención, los documentos impresos y las cuentas
 * pendientes del paciente. Reflejan backend/src/api/admin/{medical-orders,
 * clinical-notes, documents, patient-bills}.
 */

export type Destinatario = 'nursing' | 'pharmacy';

/** Una versión anterior de la nota: corregir no borra lo escrito. */
export interface RevisionDeNota {
  content: string;
  findings: string | null;
  procedures: string | null;
  attended_at: string | null;
  written_at: string | null;
  written_by: string | null;
}

export interface NotaDeAtencion {
  id: string;
  customer_id: string;
  customer_name: string | null;
  author_id: string;
  author_name: string | null;
  author_role: 'doctor' | 'nurse' | 'admin';
  medical_order_id: string | null;
  content: string;
  /** Qué revisó y qué hizo, en la nota del médico. */
  findings?: string | null;
  procedures?: string | null;
  /** Fecha de la atención; si falta, la de captura. */
  attended_at?: string | null;
  created_at: string;
  /** Correcciones, la más reciente primero, y quién hizo la última. */
  revisions?: RevisionDeNota[] | null;
  edited_at?: string | null;
  edited_by_name?: string | null;
}

export interface CuentaPendiente {
  id: string;
  display_id: number | null;
  status: string;
  currency_code: string;
  total: number;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  items: { id: string; title: string; quantity: number; unit_price: number; variant_id: string | null }[];
  medical_orders: { id: string; creator_name: string | null; dispensed_by_name: string | null; dispensed_at: string | null }[];
}

/**
 * Órdenes pendientes de un destinatario: la bandeja de Enfermería o de Farmacia.
 *
 * ── SE ACTUALIZA SOLA ───────────────────────────────────────────────────────
 * Sin esto, una orden emitida por el médico no aparecía hasta que alguien
 * recargaba la página, y en consultorio nadie recarga: la orden "no llegó" y
 * la culpa se la lleva el sistema. Cada 15 s mientras la pestaña está a la
 * vista, y al volver a ella. El mismo intervalo que usa la caja para saber si
 * otra persona la tiene abierta.
 */
export const INTERVALO_BANDEJA_MS = 15_000;

export const useBandeja = (destinatario: Destinatario) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['medical-orders', { status: 'pending', recipient_area: destinatario }],
    refetchInterval: INTERVALO_BANDEJA_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ medical_orders: OrdenMedica[] }>('/admin/medical-orders', {
        query: { status: 'pending', recipient_area: destinatario },
      });
      return [...r.medical_orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });
};

export const useAjustarOrden = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['medical-orders', 'items'],
    // `motivo`: obligatorio (20+ caracteres) cuando Enfermería o Farmacia quitan
    // o reducen lo recetado. Ver backend/src/lib/ajustes-de-orden.ts.
    mutationFn: async ({ id, items, motivo }: { id: string; items: { variant_id: string; quantity: number; product_title?: string; instructions?: string }[]; motivo?: string }) => {
      const r = await sdk.client.fetch<{ medical_order: OrdenMedica; cambios: string[] }>(`/admin/medical-orders/${id}/items`, {
        method: 'POST',
        body: { items, ...(motivo ? { motivo } : {}) },
      });
      return r;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['medical-orders'] }),
    onError: (error) => showErrorToast(error),
  });
};

export interface ResultadoDeAplicar {
  medical_order: OrdenMedica;
  lotes: { product_title: string | null; batch_number: string | null; cantidad: number; saldo_restante: number }[];
  cuenta: CuentaPendiente | null;
  advertencia?: string;
}

/** Enfermería aplica la orden: sale de su almacén y se carga a la cuenta del paciente. */
export const useAplicarOrden = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['medical-orders', 'consume'],
    mutationFn: async (id: string) => {
      return sdk.client.fetch<ResultadoDeAplicar>(`/admin/medical-orders/${id}/consume`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-orders'] });
      queryClient.invalidateQueries({ queryKey: ['medical-stock'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-de-almacen'] });
      queryClient.invalidateQueries({ queryKey: ['patient-bills'] });
    },
    onError: (error) => showErrorToast(error),
  });
};

export const useNotasDeAtencion = (filtros: { customer_id?: string; medical_order_id?: string }, enabled = true) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['clinical-notes', filtros],
    enabled,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ clinical_notes: NotaDeAtencion[] }>('/admin/clinical-notes', { query: filtros });
      return r.clinical_notes;
    },
  });
};

export const useEscribirNota = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['clinical-notes', 'create'],
    mutationFn: async (datos: { customer_id: string; content: string; medical_order_id?: string }) => {
      const r = await sdk.client.fetch<{ clinical_note: NotaDeAtencion }>('/admin/clinical-notes', { method: 'POST', body: datos });
      return r.clinical_note;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical-notes'] }),
    onError: (error) => showErrorToast(error),
  });
};

/** Corrige una nota propia (o cualquiera, siendo Administración): el servidor guarda la versión anterior. */
export const useCorregirNota = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['clinical-notes', 'update'],
    mutationFn: async ({ id, ...datos }: { id: string; content?: string; findings?: string; procedures?: string; attended_at?: string | null }) => {
      const r = await sdk.client.fetch<{ clinical_note: NotaDeAtencion }>(`/admin/clinical-notes/${id}`, { method: 'PUT', body: datos });
      return r.clinical_note;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clinical-notes'] }),
    onError: (error) => showErrorToast(error),
  });
};

export type TipoDocumento = 'receta' | 'nota' | 'corte';

/** Pide un documento al servidor y lo manda a la impresora. */
export const useImprimirDocumento = () => {
  const sdk = useMedusaSdk();
  return useMutation({
    mutationKey: ['documents'],
    mutationFn: async ({ tipo, id }: { tipo: TipoDocumento; id: string }) => {
      const r = await sdk.client.fetch<{ html: string; title: string }>(`/admin/documents/${tipo}/${id}`);
      const impreso = imprimirHtml(r.html);
      if (!impreso) {
        throw new Error('La impresión sólo está disponible en el navegador.');
      }
      return r.title;
    },
    onSuccess: (titulo) => Toast.show({ type: 'success', text1: 'Enviado a la impresora', text2: titulo }),
    onError: (error) => showErrorToast(error),
  });
};

/**
 * Lo que Caja tiene por cobrar, y quién está todavía en consulta.
 *
 * Se refresca sola cada 15 s, igual que la bandeja de Enfermería: en cuanto
 * Enfermería aplica una orden, la cuenta aparece aquí sin que nadie recargue.
 * `esperando` son los pacientes con órdenes que Enfermería aún no aplica: se
 * enseñan en gris para que Caja no busque una cuenta que todavía no existe.
 */
export const usePorCobrar = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['patient-bills', 'todas'],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ bills: CuentaPendiente[]; esperando: PacienteConPendientes[] }>('/admin/patient-bills');
      return { cuentas: r.bills, esperando: r.esperando ?? [] };
    },
  });
};

/** Las cuentas pendientes (consumo en consulta) de un paciente. */
export const useCuentasPendientes = (customerId?: string) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['patient-bills', customerId ?? null],
    enabled: !!customerId,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ bills: CuentaPendiente[] }>('/admin/patient-bills', { query: { customer_id: customerId } });
      return r.bills;
    },
  });
};

export interface MiPerfil {
  id: string;
  nombre: string;
  rol: string | null;
  rol_etiqueta: string | null;
  numero_empleado: string | null;
  perfil_profesional: {
    cedula_profesional?: string;
    universidad?: string;
    especialidad?: string;
    cedula_especialidad?: string;
    telefono?: string;
    consultorio_nombre?: string;
    consultorio_direccion?: string;
    logo_url?: string;
  };
  perfil_completo: boolean;
  clinica: { establecimiento: string; direccion?: string | null; telefono?: string | null; rfc?: string | null; logo_url?: string | null };
}

/** Quién soy para la receta: mis datos profesionales y los de la clínica (GET /admin/mi-perfil). */
export const useMiPerfil = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['mi-perfil'],
    queryFn: () => sdk.client.fetch<MiPerfil>('/admin/mi-perfil'),
    staleTime: 5 * 60 * 1000,
  });
};

export type ExistenciaPorArea = { nursing: number; pharmacy: number };

/**
 * Cuánto hay disponible de cada presentación en Enfermería y en Farmacia
 * (GET /admin/medical-stock). Para recetar sólo lo que hay y para que la
 * bandeja diga dónde está cada cosa.
 */
export const useExistenciasPorArea = (variantIds: string[]) => {
  const sdk = useMedusaSdk();
  const ids = [...new Set(variantIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['medical-stock', ids],
    enabled: ids.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ existencias: Record<string, ExistenciaPorArea> }>('/admin/medical-stock', {
        query: { variant_ids: ids.join(',') },
      });
      return r.existencias;
    },
  });
};

export interface PacienteConPendientes {
  customer_id: string;
  customer_name: string | null;
  pendientes: number;
  desde: string;
}

/** Pacientes con órdenes o recetas pendientes, quien más espera primero. */
export const usePacientesPendientes = (area?: Destinatario, opciones?: { enabled?: boolean }) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['medical-orders', 'pacientes-pendientes', area ?? 'todas'],
    queryFn: async () => (await sdk.client.fetch<{ pacientes: PacienteConPendientes[] }>('/admin/pacientes-pendientes', { query: area ? { recipient_area: area } : {} })).pacientes,
    ...opciones,
  });
};
