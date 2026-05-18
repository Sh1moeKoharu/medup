import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { AdminCreateRegion, AdminRegionFilters, AdminRegionResponse, FindParams } from '@medusajs/types';
import { useInfiniteQuery, useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query';

const PER_PAGE = 20;

export const useRegions = (query?: Omit<FindParams & AdminRegionFilters, 'offset' | 'limit'>) => {
  const sdk = useMedusaSdk();

  return useInfiniteQuery({
    queryKey: ['regions', JSON.stringify(query)],
    queryFn: async ({ pageParam = 1 }) => {
      return sdk.admin.region.list({
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

export const useCreateRegion = (
  options?: Omit<UseMutationOptions<AdminRegionResponse, Error, AdminCreateRegion>, 'mutationKey' | 'mutationFn'>,
) => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['create-region'],
    mutationFn: async (data: AdminCreateRegion) => {
      return sdk.admin.region.create(data);
    },
    ...options,
    onSuccess: async (...args) => {
      await queryClient.invalidateQueries({
        queryKey: ['regions'],
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
