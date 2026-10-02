import { useMedusaSdk } from '@/contexts/auth';
import type { Recibo } from '@/utils/imprimir-recibo';
import { AdminOrderFilters, AdminOrderListResponse } from '@medusajs/types';
import { InfiniteData, UndefinedInitialDataInfiniteOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showErrorToast } from '@/utils/errors';

const PER_PAGE = 20;

export const useOrders = (
  query?: Omit<AdminOrderFilters, 'limit' | 'offset'>,
  limit = PER_PAGE,
  options?: Omit<
    UndefinedInitialDataInfiniteOptions<
      AdminOrderListResponse,
      unknown,
      InfiniteData<AdminOrderListResponse>,
      readonly unknown[],
      number
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
  >,
) => {
  const sdk = useMedusaSdk();

  return useInfiniteQuery({
    queryKey: ['orders', JSON.stringify(query ?? {})],
    queryFn: async ({ pageParam = 1 }) => {
      return sdk.admin.order.list({
        ...query,
        limit,
        offset: (pageParam - 1) * limit,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const nextPage = (lastPage.offset + lastPage.limit) / limit + 1;
      return lastPage.count > lastPage.offset + lastPage.limit ? nextPage : undefined;
    },
    getPreviousPageParam: (firstPage) => {
      const prevPage = (firstPage.offset + firstPage.limit) / limit - 1;
      return prevPage >= 1 ? prevPage : undefined;
    },
    ...options,
  });
};

export const useOrder = (orderId: string) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['orders', 'order', orderId],
    queryFn: async () => {
      return sdk.admin.order.retrieve(orderId, {
        fields:
          '+tax_total,+discount_total,+subtotal,+total,+items.variant.options.*,+items.variant.options.option.*,+items.variant.inventory_quantity,+customer.*',
      });
    },
    enabled: !!orderId,
  });
};

/**
 * Recibo de una venta, ya armado por el servidor.
 *
 * No se compone en el dispositivo a propósito: el contenido del comprobante
 * —incluida la regla sobre medicamentos controlados— lo decide el servidor en
 * /admin/receipts/:id, donde no se puede eludir desde la consola del navegador.
 *
 * `enabled` en false por omisión: sólo se pide cuando el cajero pulsa imprimir,
 * no al abrir la pantalla.
 */
export const useRecibo = (orderId?: string) => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['recibo', orderId],
    queryFn: async () => {
      const res = await sdk.client.fetch<{ recibo: Recibo }>(`/admin/receipts/${orderId}`);
      return res.recibo;
    },
    enabled: false,
    gcTime: 0,
  });
};

/**
 * Cómo se pagó una venta: efectivo, tarjeta (con su referencia) o
 * transferencia. Sale del mismo recibo que arma el servidor. El detalle de la
 * orden enseñaba el "estado del pago" de Medusa, que en el mostrador siempre
 * dice «Sin pagar» porque el cobro se registra en la caja, no en un procesador.
 */
export const useFormaDePago = (orderId?: string, enabled = true) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['recibo', orderId, 'pago'],
    enabled: enabled && !!orderId,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const res = await sdk.client.fetch<{ recibo: Recibo }>(`/admin/receipts/${orderId}`);
      return { metodo_pago: res.recibo.metodo_pago ?? null, referencia: res.recibo.referencia ?? null };
    },
  });
};

/**
 * Cierra una venta que se cobró pero quedó «Sin cerrar» (se cortó la conexión
 * entre registrar el cobro y completar la orden). No vuelve a cobrar nada.
 */
export const useCerrarVenta = (orderId: string) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['orders', 'order', orderId, 'complete'],
    mutationFn: async () => sdk.client.fetch(`/admin/orders/${orderId}/complete`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'], exact: false }),
    onError: (error) => showErrorToast(error),
  });
};
