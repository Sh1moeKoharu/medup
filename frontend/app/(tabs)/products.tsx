import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useProducts } from '@/api/hooks/products';
import { CircleAlert } from '@/components/icons/circle-alert';
import { ScanBarcode } from '@/components/icons/scan-barcode';
import { SearchInput } from '@/components/SearchInput';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { formatearDinero } from '@/utils/dinero';
import { Plus } from '@/components/icons/plus';
import { useSettings } from '@/contexts/settings';
import { useAddToDraftOrder, useCurrentDraftOrder, useUpdateDraftOrderItem } from '@/api/hooks/draft-orders';
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
  const draftOrder = useCurrentDraftOrder();
  const updateDraftOrderItem = useUpdateDraftOrderItem();

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

  // Se calcula UNA vez y lo usan el nombre y el boton redondo. Tenerlo
  // repetido era la forma segura de que un dia uno de los dos dejara anadir
  // algo que el otro bloqueaba: sin turno de caja, sin existencia o sin
  // variante.
  const noSePuedeAgregar =
    !defaultVariant || addToDraftOrder.isPending || updateDraftOrderItem.isPending || !isSessionOpen || item.status === 'draft';

  const agregarAlCarrito = () => {
    if (!defaultVariant) return;
    // Mientras una adición está en camino no se lanza otra: Medusa sólo admite
    // una edición abierta por carrito, y dos toques seguidos chocaban con
    // «already has an existing active order change».
    if (addToDraftOrder.isPending || updateDraftOrderItem.isPending) return;
    // Si ya está en el carrito, se SUMA a su renglón. Medusa añade un renglón
    // nuevo por cada llamada aunque sea la misma presentación, y el carrito
    // enseñaba «Paracetamol ×1» dos veces en vez de «×2»: se vio en el manual.
    const existente = (draftOrder.data?.draft_order?.items ?? []).find((i) => i.variant_id === defaultVariant.id);
    if (existente) {
      updateDraftOrderItem.mutate({ id: existente.id, update: { quantity: (existente.quantity ?? 0) + 1 } });
      return;
    }
    addToDraftOrder.mutate({
      items: [
        {
          quantity: 1,
          variant_id: defaultVariant.id,
          unit_price: minPrice !== undefined ? minPrice : 0,
        },
      ],
    });
  };

  return (
    <View className="w-full px-2">
      <View className="flex w-full bg-white rounded-2xl p-4 shadow-sm border border-black">
        {/*
          La FOTO tambien anade. Tocar cualquier parte de la tarjeta mete el
          producto al carrito, que es como se cobra en un mostrador.

          La ficha del producto pasa a la pulsacion LARGA, y no se quita: es el
          unico sitio donde se elige presentacion cuando un producto tiene mas
          de una. Al tocar corto siempre entra la primera, asi que sin esta
          salida no habria forma de pedir la otra.

          Aqui no se desactiva nada aunque no se pueda anadir: `agregarAlCarrito`
          ya se protege solo, y desactivandolo se perderia tambien el acceso a
          la ficha justo cuando mas falta hace saber por que no se puede vender.
        */}
        <TouchableOpacity
          className="flex w-full gap-2"
          onPress={agregarAlCarrito}
          onLongPress={onPress}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`Añadir ${item.title} al carrito. Mantén pulsado para ver la ficha.`}
          activeOpacity={0.7}
        >
          <View
            className="aspect-square overflow-hidden rounded-xl bg-gray-50 mb-2 relative"
            testID={`product-handle_${item.handle}_image`}
          >
            {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-contain" />}
            {item.status === 'draft' && (
              <View className="absolute inset-0 bg-white/60 items-center justify-center">
                <View className="bg-error-200 px-3 py-1.5 rounded-full border border-error-300 shadow-sm">
                  <Text className="text-error-500 text-xs font-bold text-center uppercase tracking-wider">Sin existencia</Text>
                </View>
              </View>
            )}
          </View>
          <View>
            {(() => {
              const medicalInventories = (item.variants || []).map((v: any) => v.medical_inventory).filter(Boolean);
              if (medicalInventories.length > 0) {
                const sorted = medicalInventories.sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
                const nearest = sorted[0];
                return (
                  <View className="mb-2">
                    <Text className="text-[10px] text-error-500 font-medium">Caducidad: {new Date(nearest.expiration_date).toLocaleDateString()}</Text>
                    {nearest.shelf_location && <Text className="text-[10px] text-gray-400">Estante: {nearest.shelf_location}</Text>}
                  </View>
                );
              }
              return null;
            })()}
          </View>
        </TouchableOpacity>

        {/*
          El NOMBRE añade al carrito.

          Va fuera del bloque de arriba a proposito: ese abre la ficha del
          producto, y son dos acciones distintas. La foto detalla, el nombre
          anade. Un mostrador cobra tocando el nombre; quien necesita elegir
          presentacion o cantidad entra por la imagen.

          Se apaga con LO MISMO que apaga el boton redondo, asi que nunca
          puede anadir algo que el otro rechaza.
        */}
        <TouchableOpacity
          onPress={agregarAlCarrito}
          disabled={noSePuedeAgregar}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Añadir ${item.title} al carrito`}
          className="mb-1 min-h-toque justify-center"
        >
          <Text className={clx('text-sm font-medium', noSePuedeAgregar && 'text-gray-300')}>
            {item.title}
          </Text>
        </TouchableOpacity>

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-bold text-lg leading-none pt-1">
            {amounts.length === 0 || (typeof minPrice !== 'number' && typeof maxPrice !== 'number')
              ? 'Sin precio'
              : minPrice === maxPrice
                ? formatearDinero(minPrice, currencyCode)
                : `${formatearDinero(minPrice, currencyCode)} — ${formatearDinero(maxPrice, currencyCode)}`}
          </Text>

          <TouchableOpacity
            className={clx(
              "h-10 w-10 rounded-full items-center justify-center shadow-sm",
              (!defaultVariant || addToDraftOrder.isPending || !isSessionOpen || item.status === 'draft')
                ? "bg-gray-200"
                : "bg-black"
            )}
            disabled={noSePuedeAgregar}
            onPress={agregarAlCarrito}
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
  const numColumns = useBreakpointValue({ base: 2, md: 3, lg: 4, xl: 5 });
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
        <View className="mt-4 mx-auto w-full max-w-2xl rounded-xl border border-warning-300 bg-warning-200 p-3">
          <Text className="text-center text-sm text-warning-500 font-medium">
            Abre una sesión en la pestaña 'Caja'para poder añadir productos a la venta.
          </Text>
        </View>
      )}
      
      {/* Buscar y escanear son la misma tarea —encontrar un producto— y ahora
          empiezan en la misma fila. El escáner dejó de ser una pestaña para que
          las etiquetas de la barra quepan en un teléfono (ver _layout.tsx). */}
      <View className="mt-2 mx-auto w-full max-w-2xl flex-row items-center gap-2">
        <SearchInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Buscar productos..."
          className="flex-1"
        />
        <TouchableOpacity
          onPress={() => router.push('/scan')}
          accessibilityRole="button"
          accessibilityLabel="Escanear código de barras"
          className="h-12 w-12 items-center justify-center rounded-full border border-gray-200"
        >
          <ScanBarcode size={20} />
        </TouchableOpacity>
      </View>

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
      <View className="flex-1 flex-row bg-canvas">
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
    <View className="flex-1 bg-canvas">
      {content}
    </View>
  );
}
