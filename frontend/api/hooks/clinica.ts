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

export interface NotaDeAtencion {
  id: string;
  customer_id: string;
  customer_name: string | null;
  author_id: string;
  author_name: string | null;
  author_role: 'doctor' | 'nurse' | 'admin';
  medical_order_id: string | null;
  content: string;
  created_at: string;
}

export interface CuentaPendiente {
  id: string;
  display_id: number | null;
  status: string;
  currency_code: string;
  total: number;
  created_at: string;
  items: { id: string; title: string; quantity: number; unit_price: number; variant_id: string | null }[];
  medical_orders: { id: string; creator_name: string | null; dispensed_by_name: string | null; dispensed_at: string | null }[];
}

/** Órdenes pendientes de un destinatario: la bandeja de Enfermería o de Farmacia. */
export const useBandeja = (destinatario: Destinatario) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['medical-orders', { status: 'pending', recipient_area: destinatario }],
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
    mutationFn: async ({ id, items }: { id: string; items: { variant_id: string; quantity: number; product_title?: string; instructions?: string }[] }) => {
      const r = await sdk.client.fetch<{ medical_order: OrdenMedica; cambios: string[] }>(`/admin/medical-orders/${id}/items`, {
        method: 'POST',
        body: { items },
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
