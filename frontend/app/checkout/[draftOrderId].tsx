import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useRecibo } from '@/api/hooks/orders';
import { imprimirRecibo } from '@/utils/imprimir-recibo';
import { useAjustesImpresion } from '@/utils/ajustes-impresion';
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
import { LOCALE_DINERO, MONEDA_POR_OMISION } from '@/utils/dinero';
import { AdminOrderLineItem } from '@medusajs/types';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import React from 'react';
import { Image, View, TextInput, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';

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
        {/* En un catálogo de una sola presentación, la opción se llama «Default»: no dice nada. */}
        {item.variant?.options?.some((o) => o.value && o.value !== 'Default') && (
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            {item.variant.options.filter((o) => o.value !== 'Default').map((option) => (
              <View className="flex-row gap-1" key={option.id}>
                <Text className="text-sm text-gray-400">{option.option?.title || option.option_id}:</Text>
                <Text className="text-sm">{option.value}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Text className="ml-auto">
        {item.unit_price.toLocaleString(LOCALE_DINERO, {
          style: 'currency',
          currency: draftOrder.data?.draft_order.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
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
  // Los 4 a 6 dígitos del comprobante de la terminal. Obligatorios con tarjeta:
  // es lo que cruza la venta con el banco cuando algo no cuadra.
  const [cardReference, setCardReference] = React.useState('');
  const referenciaValida = /^\d{4,6}$/.test(cardReference.trim());

  // El recibo se pide al servidor sólo cuando hace falta imprimirlo.
  const recibo = useRecibo(draftOrderId);
  const [errorRecibo, setErrorRecibo] = React.useState('');
  const { ajustes: ajustesImpresion } = useAjustesImpresion();

  const handleImprimir = async (): Promise<boolean> => {
    setErrorRecibo('');
    try {
      const { data } = await recibo.refetch();
      if (!data) {
        setErrorRecibo('No se pudo obtener el recibo. Puedes reimprimirlo desde Órdenes.');
        return false;
      }
      if (!imprimirRecibo(data)) {
        setErrorRecibo('Este dispositivo no puede imprimir. Usa la caja con impresora.');
        return false;
      }
      return true;
    } catch {
      setErrorRecibo('No se pudo obtener el recibo. Puedes reimprimirlo desde Órdenes.');
      return false;
    }
  };
  const [cashReceived, setCashReceived] = React.useState('');

  /**
   * Impresión automática al confirmar la venta, si esta caja la tiene activada
   * en Ajustes → Impresión. Lo pidió el tester: al completar la orden el ticket
   * sale solo.
   *
   * ── POR QUÉ ESTOS HOOKS VIVEN AQUÍ Y NO MÁS ABAJO ─────────────────────────
   * Estaban declarados DESPUÉS de los `return` tempranos de esta pantalla (el
   * de error y el de carrito vacío). React exige que los hooks se ejecuten en
   * el mismo orden en cada render: mientras la orden cargaba, el componente
   * salía antes y estos dos no llegaban a ejecutarse; al llegar los datos, sí.
   * React contaba más hooks que en el render anterior y lanzaba
   *
   *     Rendered more hooks than during the previous render.
   *
   * Resultado: la pantalla de COBRO reventaba entera. El cajero no podía
   * completar ninguna venta desde la interfaz.
   *
   * El guardia `yaImpreso` sigue haciendo falta: este efecto se re-ejecuta, y
   * sin él una venta podría imprimirse dos veces y alguien se llevaría el
   * duplicado.
   */
  const yaImpreso = React.useRef(false);

  // Se calcula con encadenamiento opcional porque ahora corre también mientras
  // los datos aún no han llegado.
  const ventaConfirmada = !!draftOrder.data && draftOrder.data.status !== 'draft';

  // «Completar orden» abre la impresión del recibo directamente (lo pidió la
  // clínica: nada de un diálogo con un botón de imprimir). Sólo cuando la
  // venta se completó AQUÍ: volver a abrir el cobro de una venta ya cerrada
  // no debe reimprimirla. Si imprimió, aviso y a vender otra vez; si no pudo,
  // queda el diálogo con el error y las otras salidas.
  const completadaAqui = completeOrder.isSuccess;
  const imprimeDirecto = ajustesImpresion.automatico && completadaAqui;

  React.useEffect(() => {
    if (!imprimeDirecto || !ventaConfirmada || yaImpreso.current) return;
    yaImpreso.current = true;
    handleImprimir().then((impreso) => {
      if (!impreso) return;
      Toast.show({ type: 'success', text1: 'Venta registrada', text2: 'Puedes reimprimir el recibo desde Órdenes.' });
      router.replace('/(tabs)/products');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imprimeDirecto, ventaConfirmada]);

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
            Reintentar
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
            No has añadido nada todavía. Vuelve al carrito, añade los productos y{'\n'}regresa aquí para
            cobrar.
          </Text>
        </View>
        <View className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onPress={() => router.back()}>
            Volver al carrito
          </Button>
          <Button className="flex-1" disabled>
            Completar orden
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
  // Por el correo fijo del invitado, no por la falta de correo: los pacientes
  // ya no llevan correo y un paciente real se tomaría por venta de mostrador.
  const isPosDefaultCustomer = !draftOrder.data.customer || customerEmail === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL;

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
                <Text className="mb-6 text-2xl">Datos del paciente</Text>

                {customerName && (
                  <View className="mb-4 flex-row">
                    <Text className="w-24 text-gray-300">Nombre completo</Text>
                    <View className="flex-1">
                      <Text>{customerName}</Text>
                    </View>
                  </View>
                )}
                <View className="mb-4 flex-row">
                  <Text className="w-24 text-gray-300">Correo</Text>
                  <View className="flex-1">
                    <Text>{customerEmail}</Text>
                  </View>
                </View>
                {customerPhone && (
                  <View className="flex-row">
                    <Text className="w-24 text-gray-300">Teléfono</Text>
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
          <Text className="text-gray-400 text-sm mb-2">Receta médica (opcional)</Text>
          <TextInput
            value={prescriptionNumber}
            onChangeText={setPrescriptionNumber}
            placeholder="Número de receta"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-base"
          />
          {draftOrder.data?.customer && (draftOrder.data.customer as any).medical_customer?.customer_type === 'b2b' && (
            <View className="mt-4 p-3 bg-info-200 border border-info-300 rounded-xl">
              <Text className="text-info-500 font-bold">Precio de convenio aplicado</Text>
              <Text className="text-info-500 text-xs mt-1">
                Convenio: {(draftOrder.data.customer as any).medical_customer.company_name}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6 gap-y-2 border-y border-gray-200 py-4">
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Impuestos</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.tax_total?.toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-gray-400">Subtotal</Text>
            <Text className="text-sm text-gray-400">
              {draftOrder.data.subtotal?.toLocaleString(LOCALE_DINERO, {
                style: 'currency',
                currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
                currencyDisplay: 'narrowSymbol',
              })}
            </Text>
          </View>
          {typeof draftOrder.data.discount_total === 'number' && draftOrder.data.discount_total > 0 && (
            <View className="flex-row justify-between">
              <Text className="text-sm text-gray-400">Descuento</Text>
              <Text className="text-sm text-gray-400">
                {(draftOrder.data.discount_total * -1)?.toLocaleString(LOCALE_DINERO, {
                  style: 'currency',
                  currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
                  currencyDisplay: 'narrowSymbol',
                })}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6 flex-row justify-between">
          <Text className="text-lg">Total</Text>
          <Text className="text-lg">
            {draftOrder.data.total?.toLocaleString(LOCALE_DINERO, {
              style: 'currency',
              currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
              currencyDisplay: 'narrowSymbol',
            })}
          </Text>
        </View>

        {/* ── Método de pago ── */}
        <View className="mb-4">
          <Text className="mb-2 text-sm text-gray-400">Método de pago</Text>
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

        {/* ── Referencia de la terminal (solo con tarjeta) ── */}
        {paymentMethod === 'card' && (
          <View className="mb-4">
            <Text className="mb-2 text-sm text-gray-400">Referencia de la terminal (4 a 6 dígitos)</Text>
            <TextInput
              value={cardReference}
              onChangeText={(t) => setCardReference(t.replace(/\D/g, '').slice(0, 6))}
              placeholder="Últimos dígitos del comprobante"
              keyboardType="number-pad"
              maxLength={6}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
            />
            {cardReference !== '' && !referenciaValida && (
              <Text className="mt-1 text-xs text-error-500">Son de 4 a 6 dígitos.</Text>
            )}
          </View>
        )}

        {/* ── Efectivo recibido (solo si pago en efectivo) ── */}
        {paymentMethod === 'cash' && draftOrder.data.total > 0 && (
          <View className="mb-4">
            <Text className="mb-2 text-sm text-gray-400">Efectivo recibido</Text>
            <TextInput
              value={cashReceived}
              onChangeText={setCashReceived}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
            />
            {cashReceived && Number(cashReceived) > 0 && (
              <View className="mt-2 rounded-xl border border-success-300 bg-success-200 p-3">
                <View className="flex-row justify-between">
                  <Text className="text-success-500">Cambio:</Text>
                  <Text className="text-lg font-bold text-success-500">
                    {Math.max(0, Number(cashReceived) - (draftOrder.data.total || 0)).toLocaleString(LOCALE_DINERO, {
                      style: 'currency',
                      currency: draftOrder.data.region?.currency_code || settings.data?.region?.currency_code || MONEDA_POR_OMISION,
                      currencyDisplay: 'narrowSymbol',
                    })}
                  </Text>
                </View>
                {Number(cashReceived) < (draftOrder.data.total || 0) && (
                  <Text className="mt-1 text-xs text-error-500">Monto insuficiente</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Sin turno no se cobra ──
            Antes la venta se completaba igual y el método de pago se perdía
            (el ticket salía sin él). Ahora el servidor exige turno abierto
            (409) y aquí se manda a abrirlo con el fondo inicial. */}
        {!cashSession.isLoading && !cashSession.data && (
          <View className="mb-4 gap-2 rounded-xl border border-warning-300 bg-warning-200 p-3">
            <Text className="text-sm text-warning-500">
              No tienes un turno de caja abierto. Ábrelo con el fondo inicial para poder cobrar.
            </Text>
            <Button variant="outline" className="self-start px-4 py-2" onPress={() => router.push('/(tabs)/cash-register')}>
              Abrir turno de caja
            </Button>
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
                    reference: paymentMethod === 'card' ? cardReference.trim() : undefined,
                    description: `Venta POS - ${PAYMENT_METHODS.find(m => m.key === paymentMethod)?.label}`,
                  });
                } catch (e) {
                  // Si el movimiento no se registró (referencia rechazada,
                  // turno cerrado), la venta NO se completa: quedaría sin
                  // método de pago en el corte.
                  console.warn('No se registró el movimiento de caja:', e);
                  return;
                }
              }
              completeOrder.mutate();
            }}
            disabled={
              !isDraftOrder ||
              !cashSession.data ||
              (paymentMethod === 'card' && !referenciaValida) ||
              (paymentMethod === 'cash' &&
                draftOrder.data?.total > 0 &&
                cashReceived !== '' &&
                Number(cashReceived) < (draftOrder.data?.total || 0))
            }
            isPending={completeOrder.isPending || addCashMovement.isPending}
          >
            Completar orden
          </Button>
        </View>
      </Layout>

      <Dialog
        visible={!isDraftOrder && pathName === `/checkout/${draftOrderId}` && (!imprimeDirecto || !!errorRecibo)}
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
            inmensa mayoría de las ventas, con el paciente esperando delante.
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
