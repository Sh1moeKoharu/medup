import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Aseguranzas: el catálogo (lo administra el panel), las del paciente y la
 * del cobro. Espejo de backend/src/lib/aseguranzas.ts: el descuento lo aplica
 * el servidor, sólo a medicamentos; aquí se elige y se enseña.
 */

export interface Aseguranza {
  id: string;
  name: string;
  discount_percent: number;
  status: 'active' | 'inactive';
  valid_from: string | null;
  valid_until: string | null;
}

export interface AseguranzaDePaciente {
  insurance_id: string;
  policy_number: string | null;
}

export interface AseguranzaAplicada {
  id: string;
  name: string;
  discount_percent: number;
  policy_number: string | null;
}

export interface AseguranzaDelCobro {
  aseguranzas: (Aseguranza & { policy_number: string | null })[];
  aplicada: AseguranzaAplicada | null;
  es_borrador: boolean;
}

/** El catálogo vigente. Lo leen todos los perfiles; cambia poco. */
export const useAseguranzas = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['insurances'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ insurances: Aseguranza[] }>('/admin/insurances', { query: { status: 'active' } });
      return r.insurances;
    },
  });
};

/** Las aseguranzas de un paciente, por su ruta propia: el expediente clínico no lo lee Caja. */
export const useAseguranzasDePaciente = (customerId: string | undefined, enabled = true) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['patient-insurances', customerId],
    enabled: enabled && !!customerId,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ insurances: AseguranzaDePaciente[] }>(`/admin/patient-insurances/${customerId}`);
      return r.insurances;
    },
  });
};

/** Guarda la lista de aseguranzas de un paciente (su expediente). */
export const useGuardarAseguranzasDePaciente = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['medical-customers', 'insurances'],
    mutationFn: async ({ customerId, insurances }: { customerId: string; insurances: AseguranzaDePaciente[] }) => {
      // Ruta propia: /admin/medical-customers es expediente clínico y Caja no escribe ahí.
      const r = await sdk.client.fetch<{ insurances: AseguranzaDePaciente[] }>(`/admin/patient-insurances/${customerId}`, { method: 'POST', body: { insurances } });
      return r.insurances;
    },
    onSuccess: (_r, { customerId }) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['medical-customers'] });
      queryClient.invalidateQueries({ queryKey: ['patient-insurances', customerId] });
    },
    onError: (error) => showErrorToast(error),
  });
};

/** Las aseguranzas del paciente de este cobro, y cuál está aplicada. */
export const useAseguranzaDelCobro = (orderId: string | undefined, enabled = true) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['draft-order', orderId, 'aseguranza'],
    enabled: enabled && !!orderId,
    queryFn: () => sdk.client.fetch<AseguranzaDelCobro>(`/admin/draft-orders/${orderId}/aseguranza`),
  });
};

/** Aplica (o quita, con null) la aseguranza al cobro. El servidor hace la resta. */
export const useAplicarAseguranza = (orderId: string | undefined) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['draft-order', orderId, 'aseguranza', 'aplicar'],
    mutationFn: async (insuranceId: string | null) => {
      return sdk.client.fetch<AseguranzaDelCobro>(`/admin/draft-orders/${orderId}/aseguranza`, { method: 'POST', body: { insurance_id: insuranceId } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['draft-order'], exact: false });
    },
    onError: (error) => showErrorToast(error),
  });
};
