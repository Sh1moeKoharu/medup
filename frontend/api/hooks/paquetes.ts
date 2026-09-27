import { useGetOrSetDraftOrderId } from '@/api/hooks/draft-orders';
import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Paquetes a precio cerrado. El catálogo lo administra el panel; aquí se
 * añade uno entero al carrito o se quita entero. Espejo de
 * backend/src/lib/paquetes.ts.
 */

export interface Paquete {
  id: string;
  name: string;
  specialist_name: string | null;
  items: { variant_id: string; product_title: string | null; quantity: number }[];
  includes_consultation: boolean;
  price: number;
  status: 'active' | 'inactive';
}

export const CLAVE_PAQUETE_ID = 'altus_paquete_id';
export const CLAVE_PAQUETE = 'altus_paquete';

/** ¿Este renglón es de un paquete? Devuelve su id y nombre. */
export const paqueteDelRenglon = (item: { metadata?: Record<string, unknown> | null }): { id: string; name: string } | null => {
  const id = item.metadata?.[CLAVE_PAQUETE_ID];
  return typeof id === 'string' && id ? { id, name: String(item.metadata?.[CLAVE_PAQUETE] ?? 'Paquete') } : null;
};

export const usePaquetes = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['packages'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ packages: Paquete[] }>('/admin/packages', { query: { status: 'active' } });
      return r.packages;
    },
  });
};

const useAccionDePaquete = (quitar: boolean) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  const getOrSetDraftOrderId = useGetOrSetDraftOrderId();
  return useMutation({
    mutationKey: ['draft-order', 'paquete', quitar ? 'quitar' : 'agregar'],
    mutationFn: async (packageId: string) => {
      const draftOrderId = await getOrSetDraftOrderId();
      return sdk.client.fetch<{ package: { id: string; name: string }; renglones: number }>(`/admin/draft-orders/${draftOrderId}/paquete`, {
        method: 'POST',
        body: { package_id: packageId, ...(quitar ? { quitar: true } : {}) },
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['draft-order'], exact: false });
    },
    onError: (error) => showErrorToast(error),
  });
};

/** Añade el paquete entero al carrito (crea el carrito si no hay). */
export const useAgregarPaquete = () => useAccionDePaquete(false);
/** Quita del carrito todos los renglones del paquete. */
export const useQuitarPaquete = () => useAccionDePaquete(true);
