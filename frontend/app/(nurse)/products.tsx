import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useProducts } from '@/api/hooks/products';
import { CircleAlert } from '@/components/icons/circle-alert';
import { Plus } from '@/components/icons/plus';
import { SearchInput } from '@/components/SearchInput';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { useBreakpointValue } from '@/hooks/useBreakpointValue';
import { useAddToDraftOrder } from '@/api/hooks/draft-orders';
import { clx } from '@/utils/clx';
import { showErrorToast } from '@/utils/errors';
import { AdminProduct } from '@medusajs/types';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as React from 'react';
import { Image, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import DoctorCartScreen from './cart';

const isPlaceholderProduct = (
  product: AdminProduct | { id: `placeholder_${string}` },
): product is { id: `placeholder_${string}` } => {
  return typeof product.id === 'string' && product.id.startsWith('placeholder_');
};

const ProductPlaceholder: React.FC<{ index: number; numColumns: number }> = ({ index, numColumns }) => {
  return (
    <View className="w-full px-2 py-1">
      <View className="flex flex-row w-full bg-white rounded-xl p-3 shadow-sm border border-gray-200 items-center justify-between">
        <View className="flex-1 mr-4">
          <View className="mb-2 h-4 w-3/4 rounded-md bg-gray-100" />
          <View className="h-3 w-1/2 rounded-md bg-gray-100" />
        </View>
        <View className="flex-row items-center gap-3">
          <View className="h-8 w-16 rounded-md bg-gray-100" />
          <View className="h-9 w-9 rounded-full bg-gray-100" />
        </View>
      </View>
    </View>
  );
};

const ProductCard: React.FC<{ item: AdminProduct; onPress: () => void; numColumns: number; index: number }> = ({ item, onPress, numColumns, index }) => {
  const addToDraftOrder = useAddToDraftOrder();
  const defaultVariant = item.variants?.[0];

  return (
    <View className="w-full px-2 py-1">
      <View className="flex flex-row w-full bg-white rounded-xl p-3 shadow-sm border border-gray-200 items-center justify-between">
        <TouchableOpacity className="flex-1 mr-4" onPress={onPress} activeOpacity={0.7}>
          <Text className="text-sm font-semibold mb-1" numberOfLines={2}>{item.title}</Text>
          {item.status === 'draft' && (
             <View className="bg-red-100 px-2 py-0.5 rounded border border-red-200 self-start mb-1">
               <Text className="text-red-700 text-[10px] font-bold uppercase tracking-wider">Agotado</Text>
             </View>
          )}
          {(() => {
            const medicalInventories = (item.variants || []).map((v: any) => v.medical_inventory).filter(Boolean);
            if (medicalInventories.length > 0) {
              const sorted = medicalInventories.sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
              const nearest = sorted[0];
              return (
                <View className="flex-row items-center gap-2">
                  <Text className="text-[10px] text-red-600 font-medium">Caducidad: {new Date(nearest.expiration_date).toLocaleDateString()}</Text>
                  {nearest.shelf_location && <Text className="text-[10px] text-gray-500">Estante: {nearest.shelf_location}</Text>}
                </View>
              );
            }
            return null;
          })()}
        </TouchableOpacity>
        
        <View className="flex-row items-center gap-3">
          <TouchableOpacity 
             className="px-3 py-1.5 bg-gray-100 rounded-lg border border-gray-200"
             onPress={onPress}
          >
              <Text className="text-gray-700 font-semibold text-xs">Detalles</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={clx(
              "h-9 w-9 rounded-full items-center justify-center shadow-sm",
              (!defaultVariant || addToDraftOrder.isPending || item.status === 'draft')
                ? "bg-gray-300"
                : "bg-[#1B1B1B]"
            )}
            disabled={!defaultVariant || addToDraftOrder.isPending || item.status === 'draft'}
            onPress={() => {
              if (!defaultVariant) return;
              addToDraftOrder.mutate({
                items: [{ 
                  quantity: 1, 
                  variant_id: defaultVariant.id,
                  unit_price: 0
                }]
              });
            }}
          >
            <Plus size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default function DoctorProductsScreen() {
  const settings = useSettings();
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 1024;
  
  // Lista de una sola columna para enfermeros
  const numColumns = 1;
  const [searchQuery, setSearchQuery] = React.useState('');
  // El campo se actualiza al instante; la búsqueda espera a que dejes de teclear.
  const busqueda = useDebouncedValue(searchQuery);
  
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

      return (
        <ProductCard
          item={item}
          index={index}
          numColumns={numColumns}
          onPress={() => handleProductPress(item)}
        />
      );
    },
    [handleProductPress, numColumns],
  );

  const data = React.useMemo(() => {
    if (productsQuery.isLoading) {
      return Array.from({ length: 15 }, (_, index) => ({
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
    <Layout className="gap-4 flex-1">
      <SearchInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar medicamentos o insumos..."
        className="mt-2 mx-auto w-full max-w-2xl"
      />

      <FlashList
        data={data}
        numColumns={numColumns}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        refreshing={productsQuery.isRefetching}
        ItemSeparatorComponent={() => <View className="h-2 w-full" />}
        automaticallyAdjustKeyboardInsets
        ListEmptyComponent={
          <View className="mt-40 flex-1 items-center">
            <CircleAlert size={24} />
            <Text className="mt-2 text-center text-xl">Ningún producto coincide{'\n'}con la búsqueda</Text>
          </View>
        }
        ListFooterComponent={
          productsQuery.isFetchingNextPage ? (
            <View className="gap-4">
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
        <View className="flex-1 px-2">
          {content}
        </View>
        <View className="flex-1 border-l border-gray-200 shadow-sm z-10 bg-white">
          <DoctorCartScreen isSidebar={true} />
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
