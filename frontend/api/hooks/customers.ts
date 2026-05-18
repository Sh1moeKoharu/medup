import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { AdminCreateCustomer, AdminCustomerFilters, AdminCustomerListResponse } from '@medusajs/types';
import {
  InfiniteData,
  UndefinedInitialDataInfiniteOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

const PER_PAGE = 20;

export const useCustomers = (
  query?: Omit<AdminCustomerFilters, 'limit' | 'offset'>,
  limit = PER_PAGE,
  options?: Omit<
    UndefinedInitialDataInfiniteOptions<
      AdminCustomerListResponse,
      unknown,
      InfiniteData<AdminCustomerListResponse>,
      readonly unknown[],
      number
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
  >,
) => {
  const sdk = useMedusaSdk();

  return useInfiniteQuery({
    queryKey: ['customers', JSON.stringify(query ?? {})],
    queryFn: async ({ pageParam = 1 }) => {
      return sdk.admin.customer.list({
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

export const useCreateCustomer = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['customers', 'create'],
    mutationFn: async (data: AdminCreateCustomer) => {
      return sdk.admin.customer.create(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['customers'],
        exact: false,
      });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};
export const useMedicalCustomers = () => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['medical-customers'],
    queryFn: async () => {
      const { medical_customers } = await sdk.client.fetch<{ medical_customers: Record<string, any> }>(
        '/admin/medical-customers',
      );
      return medical_customers;
    },
  });
};
