import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** El turno del médico (backend/src/modules/honorarios). La comisión no se expone aquí. */
export interface TurnoMedico {
  id: string;
  doctor_id: string;
  doctor_name: string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

export const useMiTurnoMedico = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['doctor-shift', 'current'],
    queryFn: async () => {
      const r = await sdk.client.fetch<{ doctor_shift: TurnoMedico | null }>('/admin/doctor-shifts/current');
      return r.doctor_shift;
    },
  });
};

export const useAbrirTurnoMedico = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['doctor-shift', 'open'],
    mutationFn: async () => {
      const r = await sdk.client.fetch<{ doctor_shift: TurnoMedico }>('/admin/doctor-shifts', { method: 'POST', body: {} });
      return r.doctor_shift;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor-shift'] }),
    onError: (error) => showErrorToast(error),
  });
};

export const useCerrarTurnoMedico = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['doctor-shift', 'close'],
    mutationFn: async (id: string) => {
      const r = await sdk.client.fetch<{ doctor_shift: TurnoMedico }>(`/admin/doctor-shifts/${id}/close`, { method: 'POST', body: {} });
      return r.doctor_shift;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor-shift'] }),
    onError: (error) => showErrorToast(error),
  });
};
