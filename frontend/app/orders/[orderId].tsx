import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL } from '@/api/hooks/draft-orders';
import { useOrder, useRecibo } from '@/api/hooks/orders';
import { Button } from '@/components/ui/Button';
import { imprimirRecibo } from '@/utils/imprimir-recibo';
import Toast from 'react-native-toast-message';
import { InfoBanner } from '@/components/InfoBanner';
import { LoadingBanner } from '@/components/LoadingBanner';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FulfillmentStatus, OrderStatus, PaymentStatus } from '@/components/ui/OrderStatus';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { AdminOrder, AdminOrderLineItem } from '@medusajs/types';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { FlatList, Image, TouchableOpacity, View } from 'react-native';
import { LOCALE_DINERO, MONEDA_POR_OMISION } from '@/utils/dinero';

const CustomerInformation: React.FC<{
  order: AdminOrder;
}> = ({ order }) => {
  const customerEmail = order.customer?.email;
  const customerName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ');
  const customerPhone = order.customer?.phone;
  const customerAddress = order.shipping_address
    ? [
        order.shipping_address.address_1,
        order.shipping_address.address_2,
        [order.shipping_address.postal_code, order.shipping_address.city].filter(Boolean).join(' '),
        order.shipping_address.province,
        order.shipping_address.country?.display_name,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;
  const isPosDefaultCustomer = !customerEmail || customerEmail === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL;

  if (isPosDefaultCustomer) {
    return (
      <View className="mb-4 gap-4">
        <Text className="text-xl">Paciente</Text>
        <View>
          <Text className="text-sm text-gray-300">
            Esta orden se cobró en el punto de venta sin registrar a un paciente.
          </Text>
        </View>
      </View>
    );
  }

  const info = [
    { label: 'Nombre completo', value: customerName },
    { label: 'Correo', value: customerEmail },
    { label: 'Domicilio', value: customerAddress },
    { label: 'Teléfono', value: customerPhone },
  ].filter((item) => item.value && item.value.trim().length > 0);

  return (
    <View className="mb-4 gap-4">
      <Text className="text-xl">Paciente</Text>
      {info.map((item, index) => (
        <View key={item.label}>
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="max-w-32 text-sm text-gray-300">{item.label}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-right text-sm">{item.value}</Text>
            </View>
          </View>
          {index < info.length - 1 && <View className="mt-2 h-hairline w-full bg-gray-200" />}
        </View>
      ))}
    </View>
  );
};

const OrderInformation: React.FC<{
  order: AdminOrder;
  currency: string;
}> = ({ order, currency }) => {
  const automaticTaxesOn = !!order.region?.automatic_taxes;
  const shippingTotal = automaticTaxesOn ? order.shipping_total : order.shipping_subtotal;

  // Reimpresión: el cobro ya prometía "puedes reimprimirlo desde Órdenes" y
  // aquí no había ningún botón. El recibo se pide al servidor, como siempre.
  const recibo = useRecibo(order.id);
  const reimprimir = async () => {
    const { data } = await recibo.refetch();
    if (!data || !imprimirRecibo(data)) {
      Toast.show({ type: 'error', text1: 'No se pudo imprimir el recibo', text2: 'Usa la caja con impresora.' });
    }
  };

  return (
    <>
      <View className="mb-4 flex-row items-center justify-between gap-3">
        <Text className="text-xl">Detalle del pedido</Text>
        <Button variant="outline" className="px-4 py-2" onPress={reimprimir} isPending={recibo.isFetching}>
          Reimprimir recibo
        </Button>
      </View>
      <View className="mb-6 gap-2">
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Estado del pedido</Text>
          </View>
          <OrderStatus order={order} />
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Estado del pago</Text>
          </View>
          <PaymentStatus order={order} />
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Estado del surtido</Text>
          </View>
          <FulfillmentStatus order={order} />
        </View>
      </View>
      <CustomerInformation order={order} />
      <Text className="mb-4 text-xl">Resumen</Text>
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">{automaticTaxesOn ? 'Subtotal (con impuestos)' : 'Subtotal'}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm">
              {order.item_total.toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
        </View>
        {shippingTotal > 0 && (
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-sm text-gray-300">{automaticTaxesOn ? 'Envío (con impuestos)' : 'Envío'}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-right text-sm">
                {shippingTotal.toLocaleString(LOCALE_DINERO, {
                  style: 'currency',
                  currency,
                  currencyDisplay: 'narrowSymbol',
                })}
              </Text>
            </View>
          </View>
        )}
        {order.discount_total > 0 && (
          <View className="flex-row items-center justify-between gap-4">
            <View className="flex-1">
              <Text className="text-sm text-gray-300">Descuento</Text>
            </View>
            <View className="flex-1">
              <Text className="text-right text-sm">
                {(order.discount_total * -1).toLocaleString(LOCALE_DINERO, {
                  style: 'currency',
                  currency,
                  currencyDisplay: 'narrowSymbol',
                })}
              </Text>
            </View>
          </View>
        )}
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Impuestos{automaticTaxesOn ? ' (incluidos)' : ''}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm">
              {order.tax_total.toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
        </View>
        <View className="h-hairline w-full bg-gray-200" />
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Total pagado</Text>
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm">
              {order.payment_collections
                .reduce(
                  (acc, collection) => acc + (collection.captured_amount ?? 0) - (collection.refunded_amount ?? 0),
                  0,
                )
                .toLocaleString(LOCALE_DINERO, {
                  style: 'currency',
                  currency,
                  currencyDisplay: 'narrowSymbol',
                })}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Total de notas de crédito</Text>
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm">
              {(order.credit_lines ?? [])
                .reduce((acc, collection) => acc + ((collection.amount as unknown as number) ?? 0), 0)
                .toLocaleString(LOCALE_DINERO, {
                  style: 'currency',
                  currency,
                  currencyDisplay: 'narrowSymbol',
                })}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="text-sm text-gray-300">Saldo pendiente</Text>
          </View>
          <View className="flex-1">
            <Text className="text-right text-sm">
              {(order.summary.pending_difference ?? 0).toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
        </View>
      </View>
      <View className="my-4 h-hairline w-full bg-gray-200" />
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-lg">Total</Text>
        </View>
        <View className="flex-1">
          <Text className="text-right text-lg">
            {order.total.toLocaleString(LOCALE_DINERO, {
              style: 'currency',
              currency,
              currencyDisplay: 'narrowSymbol',
            })}
          </Text>
        </View>
      </View>
    </>
  );
};

const OrderDetails: React.FC<{ animateOut: (callback?: () => void) => void }> = ({ animateOut }) => {
  const { orderId, orderNumber, orderDate } = useLocalSearchParams<{
    orderId: string;
    orderNumber: string;
    orderDate: string;
  }>();

  const settings = useSettings();
  const orderQuery = useOrder(orderId);

  // El último eslabón era 'EUR'. En un dispositivo recién puesto, sin ajustes
  // todavía, la clínica habría visto euros.
  const currency =
    orderQuery.data?.order.currency_code ||
    orderQuery.data?.order.region?.currency_code ||
    settings.data?.region?.currency_code ||
    MONEDA_POR_OMISION;

  const handleProductPress = React.useCallback(
    (product: AdminOrderLineItem) => {
      animateOut(() => {
        router.push({
          pathname: '/product-details',
          params: {
            productId: product.product_id,
            productName: product.product_title,
          },
        });
      });
    },
    [animateOut],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: AdminOrderLineItem }) => {
      const thumbnail = item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;
      return (
        <TouchableOpacity className="flex-row gap-4" onPress={() => handleProductPress(item)}>
          <View className="aspect-square h-16 overflow-hidden rounded-lg bg-gray-200">
            {thumbnail && <Image source={{ uri: thumbnail }} className="h-full w-full object-cover" />}
          </View>
          <View>
            <Text>{item.title}</Text>
            <Text className="mt-auto text-sm text-gray-300">
              {(item.variant?.options ?? []).map((o) => o.value).filter((v) => v !== 'Default').join(', ')}
            </Text>
          </View>
          <View className="ml-auto">
            <Text>
              {item.total.toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
            <Text className="mt-auto text-right text-sm text-gray-300">
              Cant.: {item.quantity.toLocaleString('es-MX')}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [currency, handleProductPress],
  );

  return (
    <>
      <View className="mb-4 flex-row items-center justify-between gap-4">
        <Text className="text-2xl">Orden #{orderNumber}</Text>
        <Text className="text-gray-300">{orderDate}</Text>
      </View>
      {orderQuery.isLoading || settings.isLoading ? (
        <LoadingBanner variant="ghost" className="my-11">
          Cargando la orden…
        </LoadingBanner>
      ) : orderQuery.isError ? (
        <View className="py-11">
          <InfoBanner colorScheme="error">
            {orderQuery.error.message || 'Ocurrió un error al cargar el detalle del pedido.'}
          </InfoBanner>
        </View>
      ) : settings.isError ? (
        <View className="py-11">
          <InfoBanner colorScheme="error">
            {settings.error.message || 'Ocurrió un error al cargar la configuración.'}
          </InfoBanner>
        </View>
      ) : orderQuery.isSuccess && orderQuery.data ? (
        <FlatList
          data={orderQuery.data.order.items}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View className="my-6 h-hairline w-full bg-gray-200" />}
          className="shrink grow-0"
          contentContainerClassName="pt-4 grow-0 pb-safe-offset-6"
          ListFooterComponentClassName="mt-14"
          ListFooterComponent={<OrderInformation order={orderQuery.data.order} currency={currency} />}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
        />
      ) : (
        <View className="py-11">
          <InfoBanner colorScheme="error">Ocurrió un error al cargar el detalle del pedido.</InfoBanner>
        </View>
      )}
    </>
  );
};

export default function OrderDetailsScreen() {
  const [visible, setVisible] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setVisible(false);

      const timeoutId = setTimeout(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      }, 100);

      return () => {
        clearTimeout(timeoutId);
      };
    }, []),
  );

  const renderContent = React.useCallback(({ animateOut }: { animateOut: (callback?: () => void) => void }) => {
    return <OrderDetails animateOut={animateOut} />;
  }, []);

  // Misma X que en el detalle de producto: es la misma hoja y tenia la misma
  // falta de salida visible.
  return (
    <BottomSheet visible={visible} onClose={() => router.back()} showCloseButton dismissOnOverlayPress>
      {renderContent}
    </BottomSheet>
  );
}
