import { useMedusaSdk } from '@/contexts/auth';
import { useQuery } from '@tanstack/react-query';

/**
 * La bitácora del sistema, tal y como la guarda el servidor.
 *
 * Cada asiento es una acción que cambió algo, con quién la hizo y con qué rol
 * en ese momento. El servidor devuelve los 100 más recientes.
 *
 * ⚠️ Sólo Administración y Auditoría pueden leerla (`/admin/audit-logs` en
 * `backend/src/lib/api-policy.ts`). Auditoría no entra al punto de venta, así
 * que aquí es cosa de Administración.
 */
export interface AsientoBitacora {
  id: string;
  user_id: string | null;
  user_email: string | null;
  /** El rol que tenía la persona AL MOMENTO de actuar, no el de hoy. */
  user_role: string | null;
  /** Número de empleado que tenía al actuar, si la cuenta lo tiene. */
  user_employee_number: string | null;
  method: string;
  endpoint: string;
  ip_address: string | null;
  payload: unknown;
  created_at: string;
}

export interface FiltrosBitacora {
  from?: string;
  to?: string;
  user_role?: string;
  user_email?: string;
  employee_number?: string;
  method?: string;
  limit?: number;
  offset?: number;
}

/** Los filtros los aplica el servidor (backend/src/lib/bitacora.ts). */
export const useBitacora = (filtros: FiltrosBitacora = {}) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['audit-logs', filtros],
    queryFn: async () => {
      const respuesta = await sdk.client.fetch<{ audit_logs: AsientoBitacora[]; count: number }>('/admin/audit-logs', {
        query: filtros,
      });
      return { asientos: respuesta.audit_logs ?? [], count: Number(respuesta.count) || 0 };
    },
    // La bitácora es un registro histórico: no hace falta refrescarla sola.
    staleTime: 30_000,
  });
};
