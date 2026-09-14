import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ──────────────────────────────────────────────────
// Tipos (reflejan backend/src/modules/medical-orders/models)
// ──────────────────────────────────────────────────

export type EstadoOrdenMedica = 'pending' | 'dispensed' | 'cancelled';

export interface RenglonOrdenMedica {
  id: string;
  variant_id: string;
  product_title: string | null;
  quantity: number;
  instructions: string | null;
}

export interface OrdenMedica {
  id: string;
  status: EstadoOrdenMedica;
  creator_id: string;
  creator_name: string | null;
  creator_role: 'doctor' | 'nurse' | 'admin';
  customer_id: string;
  customer_name: string | null;
  notes: string | null;
  /** A quién va: Enfermería (consulta) o Farmacia (mostrador). */
  recipient_area: 'nursing' | 'pharmacy';
  dispensed_by_name?: string | null;
  dispensed_at?: string | null;
  /** La cuenta del paciente a la que se cargó el consumo, si Enfermería la aplicó. */
  draft_order_id?: string | null;
  items: RenglonOrdenMedica[];
  created_at: string;
  updated_at: string;
}

export interface NuevaOrdenMedica {
  customer_id: string;
  customer_name?: string;
  notes?: string;
  recipient_area?: 'nursing' | 'pharmacy';
  items: Array<{
    variant_id: string;
    product_title: string;
    quantity: number;
    instructions?: string;
  }>;
}

// ──────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────

/**
 * Lista órdenes médicas. El filtro `creator_id` sirve para "Mis recetas".
 */
export const useOrdenesMedicas = (filtros?: { status?: EstadoOrdenMedica; customer_id?: string; creator_id?: string }) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['medical-orders', filtros ?? {}],
    queryFn: async () => {
      const response = await sdk.client.fetch<{ medical_orders: OrdenMedica[] }>('/admin/medical-orders', {
        query: filtros,
      });
      // El servidor no ordena: las más recientes primero para la bandeja.
      return [...response.medical_orders].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
  });
};

/**
 * Emite una receta. El prescriptor lo toma el servidor de la sesión, no del cuerpo.
 */
export const useCrearOrdenMedica = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['medical-orders', 'create'],
    mutationFn: async (datos: NuevaOrdenMedica) => {
      const response = await sdk.client.fetch<{ medical_order: OrdenMedica }>('/admin/medical-orders', {
        method: 'POST',
        body: datos,
      });
      return response.medical_order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-orders'] });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

/**
 * Cancela una receta pendiente. Sólo el estado `pending` admite cancelación.
 */
export const useCancelarOrdenMedica = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['medical-orders', 'cancel'],
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const response = await sdk.client.fetch<{ medical_order: OrdenMedica }>(`/admin/medical-orders/${id}/cancel`, {
        method: 'POST',
        body: { motivo },
      });
      return response.medical_order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-orders'] });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};
