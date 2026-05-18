import { useMedusaSdk } from '@/contexts/auth';
import { AdminCurrencyListParams } from '@medusajs/types';
import { useInfiniteQuery } from '@tanstack/react-query';

const PER_PAGE = 20;

export const useCurrencies = (query?: Omit<AdminCurrencyListParams, 'offset' | 'limit'>) => {
  const sdk = useMedusaSdk();

  return useInfiniteQuery({
    queryKey: ['currencies', JSON.stringify(query)],
    queryFn: async ({ pageParam = 1 }) => {
      return sdk.admin.currency.list({
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
