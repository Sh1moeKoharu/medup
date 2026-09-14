import { useAuthenticated, useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { descargarTexto } from '@/utils/descargar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { OrdenMedica } from './medical-orders';
import type { Requisicion } from './requisiciones';

/**
 * El almacén desde el punto de venta: existencias, lotes, kardex, caducidades,
 * mínimos y máximos, y lo que Farmacia surte (recetas de mostrador y
 * traspasos a Enfermería). Reflejan backend/src/api/admin/{inventory-reports,
 * medical-batches, inventory-movements, expiring-inventory, stock-policies,
 * medical-orders, requisitions}.
 *
 * Auditoría usa las lecturas; Farmacia, todo. Lo que puede hacer cada uno lo
 * decide el servidor (backend/src/lib/api-policy.ts); aquí sólo se enseña.
 */

// ── Existencias ─────────────────────────────────────────────────────────────

export interface ExistenciaDeVariante {
  variant_id: string;
  title: string;
  units: number;
  batches: number;
  quarantined_units: number;
  average_unit_cost: number | null;
  total_value: number | null;
  valued: boolean;
}

/** Existencia por presentación en un almacén (o en todos), del valorizado. */
export const useExistencias = (stockLocationId?: string | null) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['existencias', stockLocationId ?? 'todos'],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ items: ExistenciaDeVariante[]; summary: { total_units: number; total_batches: number; total_value: number } }>(
        '/admin/inventory-reports/valuation',
        { query: { stock_location_id: stockLocationId || undefined, include_quarantined: 'true' } },
      );
      return r;
    },
  });
};

// ── Lotes ───────────────────────────────────────────────────────────────────

export type EstadoLote = 'active' | 'quarantined' | 'destroyed';

export interface Lote {
  id: string;
  batch_number: string;
  expiration_date: string;
  quantity: number;
  reserved_quantity: number;
  variant_id: string;
  shelf_location: string | null;
  status: EstadoLote;
  quarantined_at: string | null;
  stock_location_id: string | null;
  stock_location_name: string | null;
  purchase_date: string | null;
  purchase_unit: string | null;
  sale_unit: string | null;
  units_per_purchase: number | null;
}

export const useLotes = (filtros: { stock_location_id?: string; variant_id?: string; status?: EstadoLote }, enabled = true) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['lotes', filtros],
    enabled,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ batches: Lote[] }>('/admin/medical-batches', { query: filtros });
      return [...r.batches].sort((a, b) => (a.expiration_date < b.expiration_date ? -1 : 1));
    },
  });
};

export interface AltaDeLote {
  variant_id: string;
  stock_location_id: string;
  batch_number: string;
  expiration_date: string;
  purchase_quantity: number;
  units_per_purchase: number;
  purchase_unit?: string;
  sale_unit?: string;
  purchase_date?: string;
  unit_cost?: number;
  apply_margin?: boolean;
  shelf_location?: string;
}

export interface ResultadoDeAlta {
  batch: Lote;
  precio: { anterior: number | null; nuevo: number; currency_code: string } | null;
  advertencia?: string;
}

const invalidarInventario = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['existencias'] });
  queryClient.invalidateQueries({ queryKey: ['lotes'] });
  queryClient.invalidateQueries({ queryKey: ['lotes-de-almacen'] });
  queryClient.invalidateQueries({ queryKey: ['kardex'] });
  queryClient.invalidateQueries({ queryKey: ['caducidades'] });
  queryClient.invalidateQueries({ queryKey: ['stock-policies'] });
};

export const useAltaDeLote = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['lotes', 'alta'],
    mutationFn: async (datos: AltaDeLote) => {
      return sdk.client.fetch<ResultadoDeAlta>('/admin/medical-batches', { method: 'POST', body: datos });
    },
    onSuccess: () => invalidarInventario(queryClient),
    onError: (error) => showErrorToast(error),
  });
};

/** Baja directa de un lote con motivo (ver backend/.../write-off). */
export const useBajaDeLoteConTipo = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['lotes', 'write-off'],
    mutationFn: async ({ id, quantity, reason, type }: { id: string; quantity: number; reason: string; type: 'exit_damage' | 'exit_adjustment' }) => {
      return sdk.client.fetch<{ batch_number: string; written_off: number; quantity_after: number }>(`/admin/medical-batches/${id}/write-off`, {
        method: 'POST',
        body: { quantity, reason, type },
      });
    },
    onSuccess: () => invalidarInventario(queryClient),
    onError: (error) => showErrorToast(error),
  });
};

/**
 * Destrucción sanitaria de un lote en cuarentena. Es irreversible, así que
 * antes se reconfirma la contraseña de quien la ordena contra el servidor,
 * igual que hace el panel.
 */
export const useDestruirLote = () => {
  const sdk = useMedusaSdk();
  const { medusaUrl, userEmail } = useAuthenticated();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['lotes', 'destroy'],
    mutationFn: async ({ id, reason, password }: { id: string; reason: string; password: string }) => {
      const auth = await fetch(`${medusaUrl.replace(/\/+$/, '')}/auth/user/emailpass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, password }),
      });
      if (!auth.ok) {
        throw new Error('Contraseña incorrecta. Inténtalo de nuevo.');
      }
      return sdk.client.fetch<{ batch_number: string; destroyed_quantity: number; authorized_by: string }>(`/admin/medical-batches/${id}/destroy`, {
        method: 'POST',
        body: { reason, notes: 'Destrucción registrada desde el punto de venta' },
      });
    },
    onSuccess: () => invalidarInventario(queryClient),
    onError: (error) => showErrorToast(error),
  });
};

// ── Mínimos y máximos ───────────────────────────────────────────────────────

export interface PoliticaDeStock {
  id: string;
  variant_id: string;
  title: string;
  product_title: string | null;
  stock_location_id: string;
  stock_location_name: string | null;
  min_quantity: number;
  max_quantity: number | null;
  current_quantity: number;
  below_min: boolean;
  shortage: number;
}

export const usePoliticasDeStock = (stockLocationId?: string | null) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['stock-policies', stockLocationId ?? 'todos'],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ stock_policies: PoliticaDeStock[]; below_min: number }>('/admin/stock-policies', {
        query: { stock_location_id: stockLocationId || undefined },
      });
      return r;
    },
  });
};

export const useGuardarPolitica = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['stock-policies', 'save'],
    mutationFn: async (datos: { variant_id: string; stock_location_id: string; min_quantity: number; max_quantity: number | null }) => {
      return sdk.client.fetch<{ stock_policy: PoliticaDeStock }>('/admin/stock-policies', { method: 'POST', body: datos });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stock-policies'] }),
    onError: (error) => showErrorToast(error),
  });
};

// ── Kardex ──────────────────────────────────────────────────────────────────

export type TipoDeMovimiento =
  | 'entry_purchase'
  | 'entry_return'
  | 'entry_adjustment'
  | 'entry_transfer'
  | 'entry_initial'
  | 'exit_sale'
  | 'exit_adjustment'
  | 'exit_transfer'
  | 'exit_expiry'
  | 'exit_damage';

export interface Movimiento {
  id: string;
  variant_id: string;
  stock_location_id: string | null;
  variant_title: string | null;
  batch_id: string | null;
  batch_number: string | null;
  expiration_date: string | null;
  quantity_delta: number;
  quantity_after: number;
  type: TipoDeMovimiento;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  user_id: string | null;
  user_email: string | null;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
}

export interface FiltrosDeKardex {
  stock_location_id?: string;
  variant_id?: string;
  type?: TipoDeMovimiento;
  from?: string;
  to?: string;
  limit?: number;
}

export const useKardex = (filtros: FiltrosDeKardex) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['kardex', filtros],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ movements: Movimiento[]; count: number; summary: { total_entries: number; total_exits: number; total_shrinkage: number; net: number } }>(
        '/admin/inventory-movements',
        { query: filtros },
      );
      return r;
    },
    staleTime: 15_000,
  });
};

// ── Caducidades ─────────────────────────────────────────────────────────────

export type Tramo = 'expired' | '30' | '60' | '90';

export interface LoteProximo {
  batch_id: string;
  batch_number: string;
  variant_id: string;
  title: string;
  product_title: string | null;
  expiration_date: string;
  quantity: number;
  shelf_location: string | null;
  stock_location_id: string | null;
  stock_location_name: string | null;
  status: string;
  days_left: number;
  tier: Tramo;
}

export type ResumenTramos = Record<Tramo, { batches: number; units: number }>;

export const useCaducidades = (stockLocationId?: string | null, days = 90) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['caducidades', stockLocationId ?? 'todos', days],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ items: LoteProximo[]; summary: ResumenTramos; horizon_days: number }>('/admin/expiring-inventory', {
        query: { stock_location_id: stockLocationId || undefined, days },
      });
      return r;
    },
  });
};

/**
 * Descarga el CSV de caducidades. La ruta devuelve texto, no JSON, así que
 * no pasa por el cliente del SDK: se pide con el token y se entrega al
 * navegador como archivo.
 */
export const useDescargarCaducidades = () => {
  const { medusaUrl, apiKey } = useAuthenticated();
  return useMutation({
    mutationKey: ['caducidades', 'csv'],
    mutationFn: async ({ stockLocationId, days = 90 }: { stockLocationId?: string | null; days?: number }) => {
      const q = new URLSearchParams();
      if (stockLocationId) q.set('stock_location_id', stockLocationId);
      q.set('days', String(days));
      const r = await fetch(`${medusaUrl.replace(/\/+$/, '')}/admin/expiring-inventory/export?${q.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message || `El servidor respondió ${r.status}.`);
      }
      const nombre = /filename="?([^";]+)"?/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? 'caducidades.csv';
      const texto = await r.text();
      if (!descargarTexto(nombre, texto, 'text/csv;charset=utf-8')) {
        throw new Error('La descarga sólo está disponible en el navegador.');
      }
      return nombre;
    },
    // El archivo se va a la carpeta de descargas sin que la pantalla cambie:
    // sin este aviso, parece que el botón no hizo nada.
    onSuccess: (nombre) => Toast.show({ type: 'success', text1: 'Archivo descargado', text2: nombre }),
    onError: (error) => showErrorToast(error),
  });
};

// ── Lo que Farmacia surte ───────────────────────────────────────────────────

export interface ResultadoDeSurtido {
  medical_order: OrdenMedica;
  dispensado_por: string;
  lotes: { product_title: string | null; batch_number: string | null; cantidad: number; saldo_restante: number }[];
  advertencia?: string;
}

/** Farmacia surte una receta de mostrador: sale de su almacén con caducidad más próxima. */
export const useSurtirReceta = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['medical-orders', 'dispense'],
    mutationFn: async (id: string) => {
      return sdk.client.fetch<ResultadoDeSurtido>(`/admin/medical-orders/${id}/dispense`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medical-orders'] });
      invalidarInventario(queryClient);
    },
    onError: (error) => showErrorToast(error),
  });
};

/** Órdenes ya surtidas por Farmacia, las más recientes primero. */
export const useRecetasSurtidas = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['medical-orders', { status: 'dispensed', recipient_area: 'pharmacy' }],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ medical_orders: OrdenMedica[] }>('/admin/medical-orders', {
        query: { status: 'dispensed', recipient_area: 'pharmacy' },
      });
      return [...r.medical_orders].sort((a, b) => ((a.dispensed_at ?? a.updated_at) < (b.dispensed_at ?? b.updated_at) ? 1 : -1)).slice(0, 20);
    },
  });
};

export interface ResultadoDeTraspaso {
  requisition: Requisicion;
  movimientos: { product_title: string | null; batch_number: string; cantidad: number; saldo_origen: number; saldo_destino: number }[];
  pendientes?: { product_title: string | null; pedido: number; disponible: number }[];
}

/**
 * Farmacia surte una requisición de Enfermería. Sin `items` surte todo lo
 * pendiente; con `items` sólo esas cantidades. Todo o nada: si a algún renglón
 * no le alcanza la existencia, el servidor responde 409 y no mueve nada.
 */
export const useSurtirRequisicion = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['requisiciones', 'dispatch'],
    mutationFn: async ({ id, items }: { id: string; items?: { item_id: string; cantidad: number }[] }) => {
      return sdk.client.fetch<ResultadoDeTraspaso>(`/admin/requisitions/${id}/dispatch`, {
        method: 'POST',
        body: items ? { items } : {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisiciones'] });
      invalidarInventario(queryClient);
    },
    onError: (error) => showErrorToast(error),
  });
};
