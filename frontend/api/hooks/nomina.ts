import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { imprimirHtml } from '@/utils/imprimir';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

/**
 * Nómina del periodo y pagos (backend/src/lib/nomina.ts y nomina-servidor.ts).
 * La leen Administración, RH y Auditoría; pagan Administración y RH.
 */

export interface DesgloseDePago {
  turnos: number;
  horas: number;
  fijo: number;
  por_hora: number;
  base_comisionable: number;
  comision: number;
  por_regla: { etiqueta: string; percent: number; base: number; comision: number }[];
  total: number;
}

export interface FilaDeNomina {
  user_id: string;
  nombre: string;
  rol: string | null;
  numero_empleado: string | null;
  esquema: { fixed_per_shift: number; hourly_rate: number; default_percent: number } | null;
  desglose: DesgloseDePago;
  pagos: { id: string; amount: number; paid_at: string; period_from: string; period_to: string; dia_desde?: string; dia_hasta?: string; reference: string | null }[];
}

export const useNomina = (desde: string, hasta: string) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['nomina', desde, hasta],
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta),
    queryFn: () => sdk.client.fetch<{ nomina: FilaDeNomina[]; total: number }>('/admin/payroll', { query: { desde, hasta } }),
  });
};

/** Registra el pago y manda el recibo a la impresora. El monto lo recalcula el servidor. */
export const useRegistrarPago = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['nomina', 'pagar'],
    mutationFn: async (datos: { user_id: string; desde: string; hasta: string; reference?: string }) => {
      const { pago } = await sdk.client.fetch<{ pago: { id: string; amount: number; user_name: string } }>('/admin/payroll/pay', { method: 'POST', body: datos });
      const recibo = await sdk.client.fetch<{ html: string }>(`/admin/documents/pago/${pago.id}`);
      imprimirHtml(recibo.html);
      return pago;
    },
    onSuccess: (pago) => {
      queryClient.invalidateQueries({ queryKey: ['nomina'] });
      Toast.show({ type: 'success', text1: 'Pago registrado', text2: pago.user_name });
    },
    onError: (error) => showErrorToast(error),
  });
};
