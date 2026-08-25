import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useProducts } from '@/api/hooks/products';
import { CircleAlert } from '@/components/icons/circle-alert';
import { SearchInput } from '@/components/SearchInput';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { Plus } from '@/components/icons/plus';
import { useSettings } from '@/contexts/settings';
import { useAddToDraftOrder } from '@/api/hooks/draft-orders';
import { useBreakpointValue } from '@/hooks/useBreakpointValue';
import { clx } from '@/utils/clx';
import { showErrorToast } from '@/utils/errors';
import { useCurrentCashSession } from '@/api/hooks/cash-session';
import { AdminProduct } from '@medusajs/types';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as React from 'react';
import { Image, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import CartScreen from './cart';

const isPlaceholderProduct = (
  product: AdminProduct | { id: `placeholder_${string}` },
): product is { id: `placeholder_${string}` } => {
  return typeof product.id === 'string' && product.id.startsWith('placeholder_');
};

const ProductPlaceholder: React.FC<{ index: number; numColumns: number }> = ({ index, numColumns }) => {
  return (
    <View className="flex-1 px-2">
      <View className="flex w-full bg-white rounded-2xl p-4 shadow-sm border border-black">
        <View className="aspect-square overflow-hidden rounded-xl bg-gray-50 mb-2" />
        <View>
          <View className="mb-2 h-4 rounded-md bg-gray-100" />
          <View className="mb-1 h-3 w-1/3 rounded-md bg-gray-100" />
        </View>
        <View className="mt-4 flex-row items-center justify-between">
          <View className="h-5 w-16 rounded-md bg-gray-100" />
          <View className="h-10 w-10 rounded-full bg-gray-100" />
        </View>
      </View>
    </View>
  );
};

const ProductCard: React.FC<{ item: AdminProduct; onPress: () => void; currencyCode: string | undefined; numColumns: number; index: number; isSessionOpen: boolean }> = ({ item, onPress, currencyCode, numColumns, index, isSessionOpen }) => {
  const [quantity, setQuantity] = React.useState(1);
  const addToDraftOrder = useAddToDraftOrder();

  const thumbnail = item.thumbnail || item.images?.[0]?.url;
  const variantPrices = (item.variants ?? [])
    .flatMap((variant) =>
      variant.prices?.filter((price) => price.currency_code === currencyCode),
    )
    .filter((price) => typeof price !== 'undefined');
  const amounts = variantPrices.map((price) => price.amount);
  const minPrice = amounts.length ? Math.min(...amounts) : undefined;
  const maxPrice = amounts.length ? Math.max(...amounts) : undefined;

  const defaultVariant = item.variants?.[0];

  return (
    <View className="w-full px-2">
      <View className="flex w-full bg-white rounded-2xl p-4 shadow-sm border border-black">
        <TouchableOpacity className="flex w-full gap-2" onPress={onPress} activeOpacity={0.7}>
          <View
            className="aspect-square overflow-hidden rounded-xl bg-gray-50 mb-2 relative"
            testID={`product-handle_${item.handle}_image`}
          >
            {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-contain" />}
            {item.status === 'draft' && (
              <View className="absolute inset-0 bg-white/60 items-center justify-center">
                <View className="bg-red-100 px-3 py-1.5 rounded-full border border-red-200 shadow-sm">
                  <Text className="text-red-700 text-xs font-bold text-center uppercase tracking-wider">Sin Stock</Text>
                </View>
              </View>
            )}
          </View>
          <View>
            <View className="mb-1 flex-row items-center gap-2">
              <Text className="text-sm font-medium shrink">{item.title}</Text>
            </View>
            {(() => {
              const medicalInventories = (item.variants || []).map((v: any) => v.medical_inventory).filter(Boolean);
              if (medicalInventories.length > 0) {
                const sorted = medicalInventories.sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
                const nearest = sorted[0];
                return (
                  <View className="mb-2">
                    <Text className="text-[10px] text-red-600 font-medium">Caducidad: {new Date(nearest.expiration_date).toLocaleDateString()}</Text>
                    {nearest.shelf_location && <Text className="text-[10px] text-gray-400">Estante: {nearest.shelf_location}</Text>}
                  </View>
                );
              }
              return null;
            })()}
          </View>
        </TouchableOpacity>

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-bold text-lg leading-none pt-1">
            {amounts.length === 0 || (typeof minPrice !== 'number' && typeof maxPrice !== 'number')
              ? 'Sin precio'
              : minPrice === maxPrice
                ? minPrice?.toLocaleString('en-US', {
                  style: 'currency',
                  currency: currencyCode,
                  currencyDisplay: 'narrowSymbol',
                })
                : `${minPrice?.toLocaleString('en-US', {
                  style: 'currency',
                  currency: currencyCode,
                  currencyDisplay: 'narrowSymbol',
                })} — ${maxPrice?.toLocaleString('en-US', {
                  style: 'currency',
                  currency: currencyCode,
                  currencyDisplay: 'narrowSymbol',
                })}`}
          </Text>

          <TouchableOpacity
            className={clx(
              "h-10 w-10 rounded-full items-center justify-center shadow-sm",
              (!defaultVariant || addToDraftOrder.isPending || !isSessionOpen || item.status === 'draft')
                ? "bg-gray-300"
                : "bg-[#1B1B1B]"
            )}
            disabled={!defaultVariant || addToDraftOrder.isPending || !isSessionOpen || item.status === 'draft'}
            onPress={() => {
              if (!defaultVariant) return;
              addToDraftOrder.mutate({
                items: [{ 
                  quantity: 1, 
                  variant_id: defaultVariant.id,
                  unit_price: minPrice !== undefined ? minPrice : 0
                }]
              });
            }}
          >
            <Plus size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default function ProductsScreen() {
  const settings = useSettings();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  const numColumns = useBreakpointValue({ base: 2, md: 3, xl: 4 });
  const [searchQuery, setSearchQuery] = React.useState('');
  // El campo se actualiza al instante; la búsqueda espera a que dejes de teclear.
  const busqueda = useDebouncedValue(searchQuery);
  const cashSession = useCurrentCashSession();
  const productsQuery = useProducts({
    q: busqueda ? busqueda : undefined,
    sales_channel_id: settings.data?.sales_channel?.id ?? undefined,
    fields: '+variants.prices.*',
  });

  const handleProductPress = React.useCallback((product: AdminProduct) => {
    router.push({
      pathname: '/product-details',
      params: { productId: product.id, productName: product.title },
    });
  }, []);

  const renderProduct = React.useCallback(
    ({ item, index }: ListRenderItemInfo<AdminProduct | { id: `placeholder_${string}` }>) => {
      if (isPlaceholderProduct(item)) {
        return <ProductPlaceholder index={index} numColumns={numColumns} />;
      }

      const thumbnail = item.thumbnail || item.images?.[0]?.url;
      const currencyCode = settings.data?.region?.currency_code ?? undefined;

      return (
        <ProductCard
          item={item}
          index={index}
          numColumns={numColumns}
          currencyCode={currencyCode}
          isSessionOpen={!!cashSession.data}
          onPress={() => handleProductPress(item)}
        />
      );
    },
    [handleProductPress, numColumns, settings.data?.region?.currency_code],
  );

  const data = React.useMemo(() => {
    if (productsQuery.isLoading) {
      return Array.from({ length: 8 }, (_, index) => ({
        id: `placeholder_${index + 1}` as const,
      }));
    }

    return productsQuery.data?.pages.flatMap((page) => page.products) || [];
  }, [productsQuery]);

  React.useEffect(() => {
    if (productsQuery.isError) {
      showErrorToast(productsQuery.error);
    }
  }, [productsQuery.error, productsQuery.isError]);

  const content = (
    <Layout className="gap-6 flex-1">
      {!cashSession.isLoading && !cashSession.data && (
        <View className="mt-4 mx-auto w-full max-w-2xl rounded-xl border border-yellow-200 bg-yellow-50 p-3">
          <Text className="text-center text-sm text-yellow-700 font-medium">
            Abre una sesión en la pestaña 'Caja'para poder añadir productos a la venta.
          </Text>
        </View>
      )}
      
      <SearchInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar productos..."
        className="mt-2 mx-auto w-full max-w-2xl"
      />

      <FlashList
        data={data}
        numColumns={numColumns}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        extraData={!!cashSession.data}
        refreshing={productsQuery.isRefetching}
        ItemSeparatorComponent={() => <View className="h-6 w-full" />}
        automaticallyAdjustKeyboardInsets
        ListEmptyComponent={
          <View className="mt-60 flex-1 items-center">
            <CircleAlert size={24} />
            <Text className="mt-2 text-center text-xl">Ningún producto coincide{'\n'}con la búsqueda</Text>
          </View>
        }
        ListFooterComponent={
          productsQuery.isFetchingNextPage ? (
            <View className="gap-6">
              <View className="flex-row">
                {Array.from({ length: numColumns }, (_, index) => (
                  <ProductPlaceholder key={index} index={index} numColumns={numColumns} />
                ))}
              </View>
              <View className="flex-row">
                {Array.from({ length: numColumns }, (_, index) => (
                  <ProductPlaceholder key={index} index={index} numColumns={numColumns} />
                ))}
              </View>
              <View className="flex-row">
                {Array.from({ length: numColumns }, (_, index) => (
                  <ProductPlaceholder key={index} index={index} numColumns={numColumns} />
                ))}
              </View>
            </View>
          ) : null
        }
        onRefresh={() => {
          productsQuery.refetch();
        }}
        onEndReached={() => {
          if (productsQuery.hasNextPage && !productsQuery.isFetchingNextPage) {
            productsQuery.fetchNextPage();
          }
        }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode={KEYBOARD_DISMISS_MODE}
      />
    </Layout>
  );

  if (isLargeScreen) {
    return (
      <View className="flex-1 flex-row bg-[#F4F4F6]">
        <View className="flex-[3]">
          {content}
        </View>
        <View className="w-96 border-l border-gray-200 shadow-sm z-10 bg-white">
          <CartScreen isSidebar={true} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F4F4F6]">
      {content}
    </View>
  );
}
