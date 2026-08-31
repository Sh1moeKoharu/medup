import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useRecibo } from '@/api/hooks/orders';
import { imprimirRecibo } from '@/utils/imprimir-recibo';
import {
  DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL,
  useCompleteDraftOrder,
  useCurrentDraftOrder,
  useDraftOrderOrOrder,
} from '@/api/hooks/draft-orders';
import { useCurrentCashSession, useAddCashMovement } from '@/api/hooks/cash-session';
import { ShoppingCart } from '@/components/icons/shopping-cart';
import { InfoBanner } from '@/components/InfoBanner';
import { CheckoutSkeleton } from '@/components/skeletons/CheckoutSkeleton';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { formatDate } from '@/utils/date';
import { AdminOrderLineItem } from '@medusajs/types';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import React from 'react';
import { Image, View, TextInput, TouchableOpacity } from 'react-native';

type PaymentMethod = 'cash' | 'card' | 'transfer';

const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'transfer', label: 'Transferencia' },
];

const DraftOrderItem: React.FC<{ item: AdminOrderLineItem }> = ({ item }) => {
  const settings = useSettings();
  const draftOrder = useCurrentDraftOrder();
  const thumbnail = item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;

  return (
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
      </View>
      <Text className="ml-auto">
        {item.unit_price.toLocaleString('en-US', {
          style: 'currency',
          currency: draftOrder.data?.draft_order.region?.currency_code || settings.data?.region?.currency_code,
          currencyDisplay: 'narrowSymbol',
        })}
      </Text>
    </View>
  );
};

export default function CheckoutScreen() {
  const pathName = usePathname();
  const { draftOrderId } = useLocalSearchParams<{ draftOrderId: string }>();
  const settings = useSettings();
  const draftOrder = useDraftOrderOrOrder(draftOrderId);
  const completeOrder = useCompleteDraftOrder(draftOrderId);
  const cashSession = useCurrentCashSession();
  const addCashMovement = useAddCashMovement();
  const [prescriptionNumber, setPrescriptionNumber] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('cash');

  // El recibo se pide al servidor sólo cuando el cajero pulsa imprimir.
  const recibo = useRecibo(draftOrderId);
  const [errorRecibo, setErrorRecibo] = React.useState('');

  const handleImprimir = async () => {
    setErrorRecibo('');
    try {
      const { data } = await recibo.refetch();
      if (!data) {
        setErrorRecibo('No se pudo obtener el recibo. Puedes reimprimirlo desde Órdenes.');
        return;
      }
      if (!imprimirRecibo(data)) {
        setErrorRecibo('Este dispositivo no puede imprimir. Usa la caja con impresora.');
      }
    } catch {
      setErrorRecibo('No se pudo obtener el recibo. Puedes reimprimirlo desde Órdenes.');
    }
  };
  const [cashReceived, setCashReceived] = React.useState('');

  const renderItem = React.useCallback<ListRenderItem<AdminOrderLineItem>>(
    ({ item }) => <DraftOrderItem item={item} />,
    [],
  );

  const items = draftOrder.data?.items || [];

  if (draftOrder.isLoading || settings.isLoading) {
    return <CheckoutSkeleton />;
  }

  if (draftOrder.isError || settings.isError) {
    return (
      <Layout>
        <Text className="text-4xl">Cobro</Text>
        <View className="flex-1 items-center justify-center gap-2">
          <InfoBanner variant="ghost" colorScheme="error" className="w-40">
            No se pudo cargar el carrito
          </InfoBanner>
          <Button
            onPress={() => {
              draftOrder.refetch();
              settings.refetch();
            }}
            isPending={draftOrder.isRefetching || settings.isRefetching}
            variant="outline"
          >
            Try Again
          </Button>
        </View>
      </Layout>
    );
  }

  if (!draftOrder.data?.items.length) {
    return (
      <Layout>
        <Text className="text-4xl">Cobro</Text>
        <View className="flex-1 items-center justify-center gap-1">
          <ShoppingCart size={24} />
          <Text className="text-xl">El carrito está vacío</Text>
          <Text className="text-center text-gray-300">
            It seems you have no items in your cart.{'\n'}Please add items to your cart before{'\n'}proceeding to
            checkout.
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            Volver al carrito
          </Button>
          <Button className="flex-1" disabled>
            Complete Order
          </Button>
        </View>
      </Layout>
    );
  }

  const isDraftOrder = draftOrder.data.status === 'draft';
  const customerEmail = draftOrder.data.customer?.email;
  const customerName = [draftOrder.data.customer?.first_name, draftOrder.data.customer?.last_name]
    .filter(Boolean)
    .join(' ');
  const customerPhone = draftOrder.data.customer?.phone;
  const isPosDefaultCustomer = !customerEmail || customerEmail === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL;

  return (
    <>
      <Layout>
        <Text className="mb-6 text-4xl">Cobro</Text>

        <FlashList
          data={items}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View className="h-hairline bg-gray-200" />}
          ListHeaderComponent={() => <Text className="text-2xl">Artículos del carrito</Text>}
          ListFooterComponent={() =>
            !isPosDefaultCustomer ? (
              <View className="mb-10 mt-4">
                <Text className="mb-6 text-2xl">Information</Text>

                {customerName && (
                  <View className="mb-4 flex-row">
                    <Text className="w-24 text-gray-300">Nombre completo</Text>
                    <View className="flex-1">
                      <Text>{customerName}</Text>
                    </View>
                  </View>
                )}
                <View className="mb-4 flex-row">
                  <Text className="w-24 text-gray-300">E-Mail</Text>
                  <View className="flex-1">
                    <Text>{customerEmail}</Text>
                  </View>
                </View>
                {customerPhone && (
                  <View className="flex-row">
                    <Text className="w-24 text-gray-300">Phone</Text>
                    <View className="flex-1">
                      <Text>{customerPhone}</Text>
                    </View>
                  </View>
                )}
              </View>
            ) : null
          }
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
        />

        {/* Medical / Pharmacy Extras */}
        <View className="mb-4 mt-2">
          <Text className="text-gray-400 text-sm mb-2">Medical Prescription (optional)</Text>
          <TextInput
            value={prescriptionNumber}
            onChangeText={setPrescriptionNumber}
            placeholder="Rx / Receta Number"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-base"
          />
          {draftOrder.data?.customer && (draftOrder.data.customer as any).medical_customer?.customer_type === 'b2b' && (
            <View className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-xl">
              <Text className="text-purple-700 font-bold">B2B Hospital Pricing Applied</Text>
              <Text className="text-purple-600 text-xs mt-1">
                Policy/Company: {(draftOrder.data.customer as any).medical_customer.company_name}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6 gap-y-2 border-y border-gray-200 py-4">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Impuestos</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.tax_total?.toLocaleString('en-US', {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Subtotal</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.subtotal?.toLocaleString('en-US', {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          {typeof draftOrder.data.discount_total === 'number' && draftOrder.data.discount_total > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Discount</Text>
              <Text className="text-sm text-gray-400">
                {(draftOrder.data.discount_total * -1)?.toLocaleString('en-US', {
                  style: 'currency',
                  currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                  currencyDisplay: 'narrowSymbol',
                })}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6 flex-row justify-between">
          <Text className="text-lg">Total</Text>
          <Text className="text-lg">
            {draftOrder.data.total?.toLocaleString('en-US', {
              style: 'currency',
              currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
              currencyDisplay: 'narrowSymbol',
            })}
          </Text>
        </View>

        {/* ── Método de Pago ── */}
        <View className="mb-4">
          <Text className="mb-2 text-sm text-gray-400">Método de Pago</Text>
          <View className="flex-row gap-2">
            {PAYMENT_METHODS.map((method) => (
              <TouchableOpacity
                key={method.key}
                onPress={() => {
                  setPaymentMethod(method.key);
                  if (method.key !== 'cash') setCashReceived('');
                }}
                className={`flex-1 items-center rounded-xl border-2 px-3 py-3 ${
                  paymentMethod === method.key
                    ? 'border-black bg-gray-50'
                    : 'border-gray-200 bg-white'
                }`}
                activeOpacity={0.7}
              >
                <Text className={`text-sm ${paymentMethod === method.key ? 'font-bold' : 'text-gray-500'}`}>
                  {method.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Efectivo recibido (solo si pago en efectivo) ── */}
        {paymentMethod === 'cash' && draftOrder.data.total > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm text-gray-400">Efectivo Recibido</Text>
            <TextInput
              value={cashReceived}
              onChangeText={setCashReceived}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
            />
            {cashReceived && Number(cashReceived) > 0 && (
              <View className="mt-2 rounded-xl border border-green-200 bg-green-50 p-3">
                <View className="flex-row justify-between">
                  <Text className="text-green-700">Cambio:</Text>
                  <Text className="text-lg font-bold text-green-700">
                    {Math.max(0, Number(cashReceived) - (draftOrder.data.total || 0)).toLocaleString('en-US', {
                      style: 'currency',
                      currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code,
                      currencyDisplay: 'narrowSymbol',
                    })}
                  </Text>
                </View>
                {Number(cashReceived) < (draftOrder.data.total || 0) && (
                  <Text className="mt-1 text-xs text-red-500">Monto insuficiente</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Aviso si no hay sesión de caja ── */}
        {!cashSession.isLoading && !cashSession.data && (
          <View className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
            <Text className="text-xs text-yellow-700">
              No hay sesión de caja abierta. El pago se registrará pero no se vinculará a un corte de caja.
            </Text>
          </View>
        )}

        <View className="pb-safe flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => router.back()}
            disabled={!isDraftOrder || completeOrder.isPending}
          >
            Regresar
          </Button>
          <Button
            className="flex-1"
            onPress={async () => {
              // Registrar movimiento en la sesión de caja ANTES de completar la orden
              if (cashSession.data?.id) {
                try {
                  await addCashMovement.mutateAsync({
                    sessionId: cashSession.data.id,
                    type: 'sale',
                    payment_method: paymentMethod,
                    amount: draftOrder.data?.total || 0,
                    order_id: draftOrderId,
                    description: `Venta POS - ${PAYMENT_METHODS.find(m => m.key === paymentMethod)?.label}`,
                  });
                } catch (e) {
                  // Continuar con la orden aunque falle el registro
                  console.warn('Failed to register cash movement:', e);
                }
              }
              completeOrder.mutate();
            }}
            disabled={
              !isDraftOrder ||
              (paymentMethod === 'cash' &&
                draftOrder.data?.total > 0 &&
                cashReceived !== '' &&
                Number(cashReceived) < (draftOrder.data?.total || 0))
            }
            isPending={completeOrder.isPending || addCashMovement.isPending}
          >
            Completar Orden
          </Button>
        </View>
      </Layout>

      <Dialog
        visible={!isDraftOrder && pathName === `/checkout/${draftOrderId}`}
        showCloseButton={false}
        dismissOnOverlayPress={false}
        onRequestClose={(event) => {
          event.preventDefault();
        }}
        onOverlayPress={(event) => {
          event.preventDefault();
        }}
        onCloseIconPress={(event) => {
          event.preventDefault();
        }}
        title="¡Pedido confirmado!"
        contentClassName="flex-shrink"
      >
        <InfoBanner colorScheme="success" className="mb-4">
          La venta se registró correctamente.
        </InfoBanner>

        {/* Imprimir va primero y en sólido: es lo que el cajero hace en la
            inmensa mayoría de las ventas, con el cliente esperando delante.
            Ver la orden es la excepción. */}
        <Button
          className="mb-2"
          isPending={recibo.isFetching}
          onPress={handleImprimir}
        >
          Imprimir recibo
        </Button>

        {!!errorRecibo && (
          <InfoBanner colorScheme="error" className="mb-2">
            {errorRecibo}
          </InfoBanner>
        )}

        <Button
          variant="outline"
          className="mb-2"
          onPress={() => {
            router.replace('/orders');
            router.push({
              pathname: '/orders/[orderId]',
              params: {
                orderId: draftOrderId,
                orderNumber: draftOrder.data.display_id,
                orderDate: formatDate(draftOrder.data.created_at),
              },
            });
          }}
        >
          Ver la venta
        </Button>
        <Button
          variant="outline"
          onPress={() => {
            router.replace('/products');
          }}
        >
          Volver al catálogo
        </Button>
      </Dialog>
    </>
  );
}
