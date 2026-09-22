import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Requisiciones (Enfermería pide a Farmacia), almacenes y bajas de lote.
 * Reflejan backend/src/modules/requisitions y backend/src/lib/almacenes.ts.
 */

export type EstadoRequisicion = 'pending' | 'dispatched' | 'received' | 'cancelled';

export interface RenglonRequisicion {
  id: string;
  variant_id: string;
  product_title: string | null;
  quantity_requested: number;
  quantity_dispatched: number;
}

export interface Requisicion {
  id: string;
  status: EstadoRequisicion;
  source_location_id: string;
  source_location_name: string | null;
  destination_location_id: string;
  destination_location_name: string | null;
  requested_by_id: string;
  requested_by_name: string | null;
  dispatched_by_name: string | null;
  received_by_name: string | null;
  notes: string | null;
  /** La orden médica que la originó, si se pidió desde la bandeja. */
  medical_order_id?: string | null;
  items: RenglonRequisicion[];
  created_at: string;
}

export interface NuevaRequisicion {
  items: Array<{ variant_id: string; product_title?: string; quantity: number }>;
  notes?: string;
  medical_order_id?: string;
}

export interface Almacen {
  id: string;
  name: string;
  area: 'pharmacy' | 'nursing' | null;
}

export interface LoteDeAlmacen {
  id: string;
  batch_number: string;
  expiration_date: string;
  quantity: number;
  variant_id: string;
  status: 'active' | 'quarantined' | 'destroyed';
  stock_location_id: string | null;
  stock_location_name: string | null;
  sale_unit: string | null;
}

/** Los almacenes, con su área (ver backend/src/lib/almacenes.ts). */
export const useAlmacenes = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['almacenes'],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ stock_locations: Array<{ id: string; name: string; metadata?: Record<string, unknown> | null }> }>(
        '/admin/stock-locations',
        { query: { fields: 'id,name,metadata', limit: 50 } },
      );
      return r.stock_locations.map<Almacen>((l) => {
        const area = l.metadata?.altus_area;
        return { id: l.id, name: l.name, area: area === 'pharmacy' || area === 'nursing' ? area : null };
      });
    },
  });
};

export const useRequisiciones = (filtros?: { status?: EstadoRequisicion | string; requested_by_id?: string; medical_order_id?: string }, opciones?: { enabled?: boolean }) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['requisiciones', filtros ?? {}],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ requisitions: Requisicion[] }>('/admin/requisitions', { query: filtros });
      return r.requisitions;
    },
    ...opciones,
  });
};

export const useCrearRequisicion = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['requisiciones', 'create'],
    mutationFn: async (datos: NuevaRequisicion) => {
      const r = await sdk.client.fetch<{ requisition: Requisicion }>('/admin/requisitions', { method: 'POST', body: datos });
      return r.requisition;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requisiciones'] }),
    onError: (error) => showErrorToast(error),
  });
};

const accion = (nombre: 'receive' | 'cancel') => () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['requisiciones', nombre],
    mutationFn: async ({ id, motivo }: { id: string; motivo?: string }) => {
      const r = await sdk.client.fetch<{ requisition: Requisicion }>(`/admin/requisitions/${id}/${nombre}`, {
        method: 'POST',
        body: motivo ? { motivo } : {},
      });
      return r.requisition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisiciones'] });
      queryClient.invalidateQueries({ queryKey: ['lotes-de-almacen'] });
    },
    onError: (error) => showErrorToast(error),
  });
};

export const useRecibirRequisicion = accion('receive');
export const useCancelarRequisicion = accion('cancel');

/** Lotes activos con existencia en un almacén. */
export const useLotesDeAlmacen = (stockLocationId?: string) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['lotes-de-almacen', stockLocationId ?? null],
    enabled: !!stockLocationId,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ batches: LoteDeAlmacen[] }>('/admin/medical-batches', {
        query: { stock_location_id: stockLocationId, status: 'active' },
      });
      return r.batches.filter((b) => b.quantity > 0);
    },
  });
};

export const useBajaDeLote = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['lotes-de-almacen', 'write-off'],
    mutationFn: async ({ id, quantity, reason, notes }: { id: string; quantity: number; reason: string; notes?: string }) => {
      return sdk.client.fetch<{ batch_number: string; written_off: number; quantity_after: number }>(
        `/admin/medical-batches/${id}/write-off`,
        { method: 'POST', body: { quantity, reason, notes } },
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lotes-de-almacen'] }),
    onError: (error) => showErrorToast(error),
  });
};
