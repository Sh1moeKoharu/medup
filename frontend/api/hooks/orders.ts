import { useMedusaSdk } from '@/contexts/auth';
import type { Recibo } from '@/utils/imprimir-recibo';
import { AdminOrderFilters, AdminOrderListResponse } from '@medusajs/types';
import { InfiniteData, UndefinedInitialDataInfiniteOptions, useInfiniteQuery, useQuery } from '@tanstack/react-query';

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
