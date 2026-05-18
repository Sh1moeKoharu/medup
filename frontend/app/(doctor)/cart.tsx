import { useCustomers } from '@/api/hooks/customers';
import {
  DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL,
  useCurrentDraftOrder,
  useUpdateDraftOrderCustomer,
  useUpdateDraftOrderItem,
  useResetDraftOrderLocalSession,
} from '@/api/hooks/draft-orders';
import { ChevronDown } from '@/components/icons/chevron-down';
import { ShoppingCart } from '@/components/icons/shopping-cart';
import { Trash2 } from '@/components/icons/trash-2';
import { UserRoundPlus } from '@/components/icons/user-round-plus';
import { X } from '@/components/icons/x';
import { InfoBanner } from '@/components/InfoBanner';
import { CartSkeleton } from '@/components/skeletons/CartSkeleton';
import { SwipeableListItem } from '@/components/SwipeableListItem';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { QuantityPicker } from '@/components/ui/QuantityPicker';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { AdminDraftOrder, AdminOrderLineItem } from '@medusajs/types';
import type { FlashListRef } from '@shopify/flash-list';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as React from 'react';
import { Image, Pressable, TouchableOpacity, View } from 'react-native';
import Animated, { SequencedTransition, SlideOutLeft } from 'react-native-reanimated';

type LineItemType =
  | { id: string; __type__: 'footer' }
  | (AdminOrderLineItem & { __type__: 'draft_order_item' });

const ItemCell = React.forwardRef<Animated.View>((props, ref) => {
  return <Animated.View {...props} layout={SequencedTransition} exiting={SlideOutLeft} ref={ref} />;
});
ItemCell.displayName = 'ItemCell';

const MedicalCartItem: React.FC<{ item: AdminOrderLineItem; onRemove?: (item: AdminOrderLineItem) => void }> = ({
  item,
  onRemove,
}) => {
  const updateDraftOrderItem = useUpdateDraftOrderItem();
  const thumbnail = item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;

  return (
    <SwipeableListItem
      rightClassName="bg-white"
      rightWidth={80}
      rightContent={
        <View className="h-full w-full flex-1 items-center justify-center p-2">
          <Pressable
            className="h-full w-full flex-1 items-center justify-center rounded-xl bg-error-500"
            onPress={() => {
              onRemove?.(item);
            }}
          >
            <Trash2 size={24} color="white" />
          </Pressable>
        </View>
      }
    >
      <View className="flex-row gap-4 bg-white py-6">
        <View className="h-[5.25rem] w-[5.25rem] overflow-hidden rounded-xl bg-gray-200">
          {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-cover" />}
        </View>
        <View className="flex-1 flex-col gap-2">
          <Text>{item.product_title}</Text>
          {item.variant && item.variant.options && item.variant.options.length > 0 && (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {item.variant.options.map((option) => (
                <View className="flex-row gap-1" key={option.id}>
                  <Text className="text-sm text-gray-400">{option.option?.title || option.option_id}:</Text>
                  <Text className="text-sm">{option.value}</Text>
                </View>
              ))}
            </View>
          )}
          <QuantityPicker
            quantity={item.quantity}
            max={item.variant?.inventory_quantity}
            onQuantityChange={(quantity) =>
              updateDraftOrderItem.mutate({
                id: item.id,
                update: {
                  quantity,
                },
              })
            }
            className="self-start"
          />
        </View>
        {/* Sin vista de precios para el doctor */}
      </View>
    </SwipeableListItem>
  );
};

const CustomerBadge: React.FC<{ customer: AdminDraftOrder['customer'] }> = ({ customer }) => {
  const updateDraftOrder = useUpdateDraftOrderCustomer();
  const defaultCustomer = useCustomers({ email: DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL }, 1);

  if (!customer || customer.email === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL) {
    return (
      <Button
        onPress={() => router.push('/customer-lookup')}
        variant="outline"
        icon={<UserRoundPlus size={20} />}
        className="mb-6 justify-between"
      >
        Seleccionar Paciente
      </Button>
    );
  }

  const customerName = [customer.first_name, customer.last_name].filter(Boolean).join(' ');

  return (
    <TouchableOpacity
      onPress={() => {
        router.push({
          pathname: '/customer-lookup',
          params: { customerId: customer.id },
        });
      }}
      className="mb-6 flex-row items-center justify-between border-b border-gray-200 pb-6"
    >
      {customerName.length > 0 ? (
        <View>
          <Text className="text-lg">{customerName}</Text>
          <Text className="text-sm text-gray-300">Paciente</Text>
        </View>
      ) : (
        <View>
          <Text className="text-sm text-gray-300">Paciente</Text>
          <Text className="text-lg">{customer.email}</Text>
        </View>
      )}

      <View className="flex-row">
        <View className="p-2">
          <ChevronDown size={24} />
        </View>
        <TouchableOpacity
          onPress={() => updateDraftOrder.mutate(defaultCustomer.data?.pages[0].customers?.[0])}
          className="p-2"
        >
          <X size={24} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const ItemSeparatorComponent = React.forwardRef<Animated.View>((props, ref) => (
  <Animated.View className="h-hairline bg-gray-200" ref={ref} />
));
ItemSeparatorComponent.displayName = 'ItemSeparatorComponent';

export default function DoctorCartScreen({ isSidebar }: { isSidebar?: boolean }) {
  const settings = useSettings();
  const draftOrder = useCurrentDraftOrder();
  const updateDraftOrderItem = useUpdateDraftOrderItem();
  const resetOrderSession = useResetDraftOrderLocalSession();
  const itemsListRef = React.useRef<FlashListRef<LineItemType>>(null);

  const [isDialogVisible, setIsDialogVisible] = React.useState(false);

  const onItemRemove = React.useCallback(
    (item: AdminOrderLineItem) => {
      updateDraftOrderItem.mutate({ id: item.id, update: { quantity: 0 } });
      itemsListRef.current?.prepareForLayoutAnimationRender();
    },
    [updateDraftOrderItem],
  );

  const renderItem = React.useCallback<ListRenderItem<LineItemType>>(
    ({ item }) =>
      item.__type__ === 'draft_order_item' ? (
        <MedicalCartItem item={item} onRemove={onItemRemove} />
      ) : null,
    [onItemRemove],
  );

  const keyExtractor = React.useCallback((item: LineItemType) => item.id, []);
  const getItemType = React.useCallback((item: LineItemType) => item.__type__, []);

  if (draftOrder.isLoading || settings.isLoading) {
    return <CartSkeleton />;
  }

  if (draftOrder.isError || settings.isError) {
    return (
      <Layout className={`pb-6 ${isSidebar ? 'px-4 md:px-4 lg:px-4 xl:px-4' : ''}`}>
        <Text className="mt-8 text-4xl">Plan Médico</Text>
        <View className="flex-1 items-center justify-center gap-2">
          <InfoBanner variant="ghost" colorScheme="error" className="w-40">
            Error de sistema
          </InfoBanner>
          <Button
            onPress={() => { draftOrder.refetch(); settings.refetch(); }}
            isPending={draftOrder.isRefetching || settings.isRefetching}
            variant="outline"
          >
            Reintentar
          </Button>
        </View>
      </Layout>
    );
  }

  if (!draftOrder.data?.draft_order || !draftOrder.data?.draft_order.items.length) {
    return (
      <Layout className={`pb-6 ${isSidebar ? 'px-4 md:px-4 lg:px-4 xl:px-4' : ''}`}>
        <Text className="mt-8 text-4xl">Plan Médico</Text>
        <CustomerBadge customer={draftOrder.data?.draft_order?.customer} />
        <View className="flex-1 items-center justify-center gap-1">
          <ShoppingCart size={24} />
          <Text className="text-xl">Sin recetas cargadas</Text>
          <Text className="text-gray-400">Añada insumos o medicamentos</Text>
        </View>
      </Layout>
    );
  }

  const items = [
    ...draftOrder.data.draft_order.items.map((item) => ({
      ...item,
      __type__: 'draft_order_item' as const,
    })),
    { id: 'footer', __type__: 'footer' as const },
  ] satisfies LineItemType[];

  return (
    <>
      <Layout className={`pb-6 flex-1 ${isSidebar ? 'px-4 md:px-4 lg:px-4 xl:px-4' : ''}`}>
        <Text className="mt-8 mb-6 text-4xl font-semibold">Plan Médico</Text>
        <CustomerBadge customer={draftOrder.data.draft_order.customer} />
        
        <FlashList
          ref={itemsListRef}
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemType={getItemType}
          ItemSeparatorComponent={ItemSeparatorComponent}
          CellRendererComponent={ItemCell}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        />

        <View className="mt-4">
          <View className="mb-4 h-hairline bg-gray-200" />
          <View className="flex-row gap-2 pb-6">
            <Button
              className="flex-1"
              disabled={draftOrder.data.draft_order.items.length === 0}
              onPress={() => setIsDialogVisible(true)}
            >
              Procesar Orden
            </Button>
          </View>
        </View>
      </Layout>

      <Prompt
        onSubmit={() => {
          resetOrderSession.mutate(undefined, {
            onSettled: () => {
              setIsDialogVisible(false);
            },
          });
        }}
        onClose={() => setIsDialogVisible(false)}
        title="¿Deseas enviar/finalizar esta orden?"
        description="Esta orden médica quedará asignada al paciente de forma silenciosa para que la clínica o farmacia pueda procesarla o entregarla localmente."
        visible={isDialogVisible}
        showCloseButton={true}
        dismissOnOverlayPress={true}
      />
    </>
  );
}
