import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ──────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────

export interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  expected_closing_amount: number | null;
  actual_closing_amount: number | null;
  difference: number | null;
  cashier_id: string;
  cashier_name: string;
  sales_channel_id: string | null;
  status: 'open' | 'closed';
  notes: string | null;
}

export interface CashMovement {
  id: string;
  session_id: string;
  order_id: string | null;
  type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
  payment_method: 'cash' | 'card' | 'transfer' | 'other';
  amount: number;
  reference: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CashSessionSummary {
  opening_amount: number;
  sales_cash: number;
  sales_card: number;
  sales_transfer: number;
  sales_other: number;
  sales_total: number;
  refunds_cash: number;
  refunds_card: number;
  refunds_total: number;
  cash_in_total: number;
  cash_out_total: number;
  transaction_count: number;
  refund_count: number;
  expected_cash_in_register: number;
  total_revenue: number;
}

// ──────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────

/**
 * Obtiene la sesión de caja activa actual
 */
export const useCurrentCashSession = () => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['cash-session', 'current'],
    queryFn: async () => {
      const response = await sdk.client.fetch<{ session: CashSession | null }>(
        '/admin/cash-sessions/current'
      );
      return response.session;
    },
  });
};

/**
 * Lista el historial de sesiones de caja
 */
export const useCashSessions = (params?: { status?: string; limit?: number }) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['cash-session', 'list', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set('status', params.status);
      if (params?.limit) searchParams.set('limit', String(params.limit));

      const response = await sdk.client.fetch<{ sessions: CashSession[] }>(
        `/admin/cash-sessions?${searchParams.toString()}`
      );
      return response.sessions;
    },
  });
};

/**
 * Abre una nueva sesión de caja
 */
export const useOpenCashSession = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['cash-session', 'open'],
    // Sin cashier_name: el servidor toma la identidad del cajero de la
    // sesión y descarta lo que se le mande. Ver src/api/admin/cash-sessions.
    mutationFn: async (data: {
      opening_amount: number;
      sales_channel_id?: string;
    }) => {
      const response = await sdk.client.fetch<{ session: CashSession }>(
        '/admin/cash-sessions',
        { method: 'POST', body: data }
      );
      return response.session;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

/**
 * Cierra la sesión de caja actual
 */
export const useCloseCashSession = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['cash-session', 'close'],
    mutationFn: async (data: {
      sessionId: string;
      actual_closing_amount: number;
      notes?: string;
    }) => {
      const response = await sdk.client.fetch<{
        session: CashSession;
        summary: {
          opening_amount: number;
          expected_cash: number;
          actual_cash: number;
          difference: number;
          difference_label: string;
        };
      }>(`/admin/cash-sessions/${data.sessionId}/close`, {
        method: 'POST',
        body: {
          actual_closing_amount: data.actual_closing_amount,
          notes: data.notes,
        },
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

/**
 * Obtiene el resumen financiero de una sesión
 */
export const useCashSessionSummary = (sessionId: string | undefined) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['cash-session', 'summary', sessionId],
    queryFn: async () => {
      const response = await sdk.client.fetch<{
        session: CashSession;
        summary: CashSessionSummary;
      }>(`/admin/cash-sessions/${sessionId}/summary`);
      return response;
    },
    enabled: !!sessionId,
    refetchInterval: 30000, // Refrescar cada 30s si está visible
  });
};

/**
 * Lista los movimientos de una sesión
 */
export const useCashMovements = (sessionId: string | undefined) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['cash-session', 'movements', sessionId],
    queryFn: async () => {
      const response = await sdk.client.fetch<{ movements: CashMovement[] }>(
        `/admin/cash-sessions/${sessionId}/movements`
      );
      return response.movements;
    },
    enabled: !!sessionId,
  });
};

/**
 * Registra un movimiento en la sesión de caja activa
 */
export const useAddCashMovement = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['cash-session', 'movement', 'add'],
    mutationFn: async (data: {
      sessionId: string;
      type: 'sale' | 'refund' | 'cash_in' | 'cash_out';
      payment_method: 'cash' | 'card' | 'transfer' | 'other';
      amount: number;
      order_id?: string;
      reference?: string;
      description?: string;
    }) => {
      const response = await sdk.client.fetch<{ movement: CashMovement }>(
        `/admin/cash-sessions/${data.sessionId}/movements`,
        {
          method: 'POST',
          body: {
            type: data.type,
            payment_method: data.payment_method,
            amount: data.amount,
            order_id: data.order_id,
            reference: data.reference,
            description: data.description,
          },
        }
      );
      return response.movement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};
