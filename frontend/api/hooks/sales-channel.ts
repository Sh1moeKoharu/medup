import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { AdminCreateSalesChannel, AdminSalesChannelListParams, AdminSalesChannelResponse } from '@medusajs/types';
import { useInfiniteQuery, useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';

const PER_PAGE = 20;

export const useSalesChannels = (query?: Omit<AdminSalesChannelListParams, 'offset' | 'limit'>) => {
  const sdk = useMedusaSdk();

  return useInfiniteQuery({
    queryKey: ['sales-channels', JSON.stringify(query)],
    queryFn: async ({ pageParam = 1 }) => {
      return sdk.admin.salesChannel.list({
        ...query,
        limit: PER_PAGE,
        offset: (pageParam - 1) * PER_PAGE,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const nextPage = (lastPage.offset + lastPage.limit) / PER_PAGE + 1;
      return lastPage.count > lastPage.offset + lastPage.limit ? nextPage : undefined;
    },
    getPreviousPageParam: (firstPage) => {
      const prevPage = (firstPage.offset + firstPage.limit) / PER_PAGE - 1;
      return prevPage >= 1 ? prevPage : undefined;
    },
  });
};

export const useCreateSalesChannel = (
  options?: Omit<
    UseMutationOptions<AdminSalesChannelResponse, Error, AdminCreateSalesChannel>,
    'mutationKey' | 'mutationFn'
  >,
) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['create-sales-channel'],
    mutationFn: async (data: AdminCreateSalesChannel) => {
      return sdk.admin.salesChannel.create(data);
    },
    ...options,
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-channels'],
        exact: false,
      });

      return options?.onSuccess?.(...args);
    },
    onError(error, variables, context) {
      showErrorToast(error);
      return options?.onError?.(error, variables, context);
    },
  });
};
