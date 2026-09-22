import {
  useCurrentCashSession,
  useOpenCashSession,
  useCashSessions,
  useCloseCashSession,
  useCashSessionSummary,
  useCashMovements,
  useAddCashMovement,
  CashMovement,
  useCajaOcupada,
} from '@/api/hooks/cash-session';
import { CircleAlert } from '@/components/icons/circle-alert';
import { Check } from '@/components/icons/check';
import { Plus } from '@/components/icons/plus';
import { Minus } from '@/components/icons/minus';
import { InfoBanner } from '@/components/InfoBanner';
import { PorCobrar } from '@/components/caja/PorCobrar';
import { formatearDinero } from '@/utils/dinero';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useImprimirDocumento } from '@/api/hooks/clinica';
import { useAuthCtx } from '@/contexts/auth';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { FlashList } from '@shopify/flash-list';
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';

/** "las 09:12" si fue hoy; "el 13 sep a las 18:40" si no. */
const horaDeApertura = (iso: string) => {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === new Date().toDateString() ? `las ${hora}` : `el ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} a las ${hora}`;
};

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

// La caja ya traía su propio respaldo a MXN. Se conserva la función, que la
// usan muchas líneas, pero por dentro pasa por el formateador del sistema.
const formatCurrency = (amount: number, currencyCode?: string) =>
  formatearDinero(amount, currencyCode);

const formatTime = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

const formatDateTime = (dateString: string) => {
  const d = new Date(dateString);
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const TYPE_LABELS: Record<string, { label: string; color: string; sign: string }> = {
  sale: { label: 'Venta', color: 'text-success-500', sign: '+' },
  refund: { label: 'Reembolso', color: 'text-error-500', sign: '-' },
  cash_in: { label: 'Entrada', color: 'text-info-500', sign: '+' },
  cash_out: { label: 'Salida', color: 'text-warning-500', sign: '-' },
};

const METHOD_LABELS: Record<string, string> = {
 cash: 'Efectivo',
 card: 'Tarjeta',
 transfer: 'Transferencia',
 other: 'Otro',
};

// Abreviatura para el distintivo circular de cada movimiento. Antes se sacaba
// con METHOD_LABELS[...].slice(0, 2), que recortaba el emoji del inicio de la
// etiqueta; al quitarlos ese recorte habria devuelto "Ef", "Ta", "Tr".
const METHOD_SHORT: Record<string, string> = {
 cash: 'EF',
 card: 'TJ',
 transfer: 'TR',
 other: 'OT',
};

// ──────────────────────────────────────────────────
// Movement Row Component
// ──────────────────────────────────────────────────

const MovementRow: React.FC<{ item: CashMovement; currencyCode?: string }> = ({
  item,
  currencyCode,
}) => {
  const typeInfo = TYPE_LABELS[item.type] || { label: item.type, color: 'text-gray-500', sign: '' };

  return (
    <View className="flex-row items-center gap-3 py-3 border-b border-gray-100">
      <View className="h-8 w-8 items-center justify-center rounded-full bg-gray-50">
        <Text className="text-xs">{METHOD_SHORT[item.payment_method] || 'OT'}</Text>
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium">{typeInfo.label}</Text>
          <Text className="text-xs text-gray-400">{METHOD_LABELS[item.payment_method]}</Text>
        </View>
        <Text className="text-xs text-gray-400">
          {item.description || item.reference || formatTime(item.created_at)}
        </Text>
      </View>
      <Text className={`font-medium ${typeInfo.color}`}>
        {typeInfo.sign}{formatCurrency(Number(item.amount), currencyCode)}
      </Text>
    </View>
  );
};

// ──────────────────────────────────────────────────
// Summary Card
// ──────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  value: number;
  currencyCode?: string;
  highlight?: boolean;
  negative?: boolean;
  /**
   * Muestra el valor como CANTIDAD, no como importe.
   *
   * Sin esto la tarjeta formateaba todo como moneda, así que el número de
   * transacciones del turno salía como "$1.00" en vez de "1". Al lado de las
   * cifras de dinero del corte, un conteo con signo de pesos se lee como un
   * importe y confunde justo donde no conviene.
   */
  conteo?: boolean;
}> = ({ label, value, currencyCode, highlight, negative, conteo }) => (
  <View
    className={`flex-1 rounded-xl p-3 ${
      highlight ? 'bg-black' : negative ? 'bg-error-200 border border-error-300' : 'bg-gray-50'
    }`}
  >
    {/*
      Sobre la tarjeta oscura la etiqueta va en claro. Las dos ramas de esta
      condición eran idénticas —`text-gray-400` en los dos casos—, así que la
      etiqueta de "Total de ventas" se dibujaba con el gris pensado para fondos
      claros encima del negro: 2.6:1, ilegible.
    */}
    <Text className={`text-xs ${highlight ? 'text-gray-200' : 'text-gray-400'}`}>{label}</Text>
    <Text className={`text-lg font-bold ${highlight ? 'text-white' : negative ? 'text-error-500' : 'text-black'}`}>
      {conteo ? Math.round(value).toLocaleString('es-MX') : formatCurrency(value, currencyCode)}
    </Text>
  </View>
);

// ──────────────────────────────────────────────────
// Open Session Form
// ──────────────────────────────────────────────────

/**
 * Los últimos cortes, para reimprimirlos. El corte lo compone el servidor
 * (/admin/documents/corte/:id) con la misma aritmética que el resumen.
 */
const CortesAnteriores: React.FC = () => {
  const cortes = useCashSessions({ status: 'closed', limit: 5 });
  const imprimir = useImprimirDocumento();
  const lista = cortes.data ?? [];
  if (!lista.length) return null;
  return (
    <View className="w-full max-w-sm gap-2 mt-8">
      <Text className="text-sm text-gray-400">Cortes anteriores</Text>
      {lista.map((s) => (
        <View key={s.id} className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <View className="flex-1">
            <Text numberOfLines={1}>{s.cashier_name}</Text>
            <Text className="text-xs text-gray-400">{new Date(s.opened_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <Button variant="outline" className="px-4 py-2" onPress={() => imprimir.mutate({ tipo: 'corte', id: s.id })} isPending={imprimir.isPending}>
            Reimprimir corte
          </Button>
        </View>
      ))}
    </View>
  );
};

const OpenSessionView: React.FC = () => {
  const settings = useSettings();
  const openSession = useOpenCashSession();
  const ocupada = useCajaOcupada().data;
  const router = useRouter();
  const { state } = useAuthCtx();
  const [openingAmount, setOpeningAmount] = useState('');

  // Quién abre la caja no se pregunta: es quien inició sesión.
  //
  // Antes esto era un campo de texto libre ("Ej: Ana García"). Cualquiera que
  // entrara como caja@… podía escribir el nombre que quisiera, y el corte de
  // caja —con su sobrante o su faltante— quedaba atribuido a esa persona. El
  // servidor ya ignora lo que se le mande aquí y toma la identidad de la
  // sesión; esto sólo la muestra para que el cajero vea con quién está
  // trabajando antes de abrir el turno.
  const cajero = state.status === 'authenticated' ? state.user : null;

  return (
    <Layout>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="flex-grow">
      <Text className="mt-8 mb-6 text-4xl">Caja</Text>

      {/* Lo que hay por cobrar se ve aunque la caja esté cerrada: es lo
          primero que hay que saber al llegar, y la razón para abrirla. */}
      <PorCobrar puedeCobrar={false} soloSiHay />

      <View className="flex-1 items-center justify-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-gray-50">
        </View>
        <Text className="text-xl font-medium">{ocupada ? 'La caja está ocupada' : 'La caja está cerrada'}</Text>
        {ocupada ? (
          <InfoBanner colorScheme="warning" className="w-full max-w-sm">
            {`Abierta por ${ocupada.cashier_name} desde ${horaDeApertura(ocupada.opened_at)}. Debe cerrarse antes de abrir otra.`}
          </InfoBanner>
        ) : (
          <Text className="text-center text-gray-400">
            Abre una sesión de caja para comenzar{'\n'}a registrar ventas y movimientos.
          </Text>
        )}

        <View className="w-full max-w-sm gap-3 mt-4">
          <View>
            <Text className="mb-1 text-sm text-gray-400">Cajero</Text>
            <View className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4">
              <Text className="text-base">{cajero?.name || 'Sesión no identificada'}</Text>
              {!!cajero?.email && <Text className="text-sm text-gray-400">{cajero.email}</Text>}
            </View>
          </View>
          <View>
            <Text className="mb-1 text-sm text-gray-400">Fondo de caja inicial</Text>
            <TextInput
              value={openingAmount}
              onChangeText={setOpeningAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
            />
          </View>
          <Button
            onPress={() =>
              // Con la caja abierta, a vender: el catálogo es donde empieza el
              // turno. Con la promesa y no con el `onSuccess` de `mutate`: al
              // abrirse la caja esta vista se desmonta, y React Query no llama
              // a los callbacks de una llamada cuyo componente ya no existe.
              openSession
                .mutateAsync({
                  opening_amount: Number(openingAmount) || 0,
                  sales_channel_id: settings.data?.sales_channel?.id,
                })
                .then(() => router.replace('/(tabs)/products'))
                .catch(() => {
                  // El error ya lo enseña el hook.
                })
            }
            isPending={openSession.isPending}
            disabled={!cajero || !!ocupada}
          >
            Abrir caja
          </Button>
        </View>

        <CortesAnteriores />
      </View>
      </ScrollView>
    </Layout>
  );
};

// ──────────────────────────────────────────────────
// Active Session View (Main Screen)
// ──────────────────────────────────────────────────

const ActiveSessionView: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const settings = useSettings();
  const cashSession = useCurrentCashSession();
  const summaryQuery = useCashSessionSummary(sessionId);
  const movementsQuery = useCashMovements(sessionId);
  const closeSession = useCloseCashSession();
  // El corte sale por la impresora al cerrar, y se puede reimprimir después.
  const imprimirCorte = useImprimirDocumento();
  const addMovement = useAddCashMovement();

  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  const [closingAmount, setClosingAmount] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  // Movement form state
  const [movType, setMovType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [movAmount, setMovAmount] = useState('');
  const [movDescription, setMovDescription] = useState('');

  const session = cashSession.data;
  const summary = summaryQuery.data?.summary;
  const movements = movementsQuery.data || [];
  const currencyCode = settings.data?.region?.currency_code;

  if (!session || !summary) return null;

  return (
    <>
      <Layout>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={summaryQuery.isRefetching}
              onRefresh={() => {
                summaryQuery.refetch();
                movementsQuery.refetch();
              }}
            />
          }
        >
          <Text className="mt-8 mb-2 text-4xl">Caja</Text>
          <View className="mb-6 flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-success-500" />
            <Text className="text-sm text-gray-400">
              Abierta por {session.cashier_name} · {formatDateTime(session.opened_at)}
            </Text>
          </View>

          {/* La acción principal del puesto, en la misma fila que la cuenta. */}
          <PorCobrar puedeCobrar />

          {/* ── Resumen Principal ── */}
          <View className="mb-4 flex-row gap-2">
            <SummaryCard label="Total de ventas" value={summary.sales_total} currencyCode={currencyCode} highlight />
            <SummaryCard label="Transacciones" value={summary.transaction_count} conteo />
          </View>

          {/* ── Desglose por método de pago ── */}
          <View className="mb-4 rounded-xl border border-gray-200 p-4 gap-3">
            <Text className="text-sm font-medium text-gray-500">Ventas por método de pago</Text>
            <View className="flex-row justify-between">
              <Text className="text-sm">Efectivo</Text>
              <Text className="text-sm font-medium">{formatCurrency(summary.sales_cash, currencyCode)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm">Tarjeta</Text>
              <Text className="text-sm font-medium">{formatCurrency(summary.sales_card, currencyCode)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-sm">Transferencia</Text>
              <Text className="text-sm font-medium">{formatCurrency(summary.sales_transfer, currencyCode)}</Text>
            </View>
            {summary.refunds_total > 0 && (
              <>
                <View className="h-hairline bg-gray-100" />
                <View className="flex-row justify-between">
                  <Text className="text-sm text-error-500">Reembolsos</Text>
                  <Text className="text-sm font-medium text-error-500">
                    -{formatCurrency(summary.refunds_total, currencyCode)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* ── Efectivo en caja ── */}
          <View className="mb-4 rounded-xl border-2 border-black p-4 gap-2">
            <Text className="text-sm font-medium">Efectivo esperado en caja</Text>
            <Text className="text-2xl font-bold">
              {formatCurrency(summary.expected_cash_in_register, currencyCode)}
            </Text>
            <View className="flex-row justify-between">
              <Text className="text-xs text-gray-400">Apertura: {formatCurrency(summary.opening_amount, currencyCode)}</Text>
              {(summary.cash_in_total > 0 || summary.cash_out_total > 0) && (
                <Text className="text-xs text-gray-400">
                  Entradas: +{formatCurrency(summary.cash_in_total, currencyCode)} / Salidas: -{formatCurrency(summary.cash_out_total, currencyCode)}
                </Text>
              )}
            </View>
          </View>

          {/* ── Botones de acción ── */}
          <View className="mb-4 flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              icon={<Plus size={16} />}
              onPress={() => {
                setMovType('cash_in');
                setShowMovementDialog(true);
              }}
            >
              Entrada
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              icon={<Minus size={16} />}
              onPress={() => {
                setMovType('cash_out');
                setShowMovementDialog(true);
              }}
            >
              Salida
            </Button>
          </View>

          {/* ── Últimos movimientos ── */}
          <Text className="mb-2 text-lg font-medium">Últimos movimientos</Text>
          {movements.length === 0 ? (
            <View className="items-center py-8">
              <CircleAlert size={20} />
              <Text className="mt-2 text-sm text-gray-400">No hay movimientos registrados</Text>
            </View>
          ) : (
            movements.slice(0, 15).map((mov) => (
              <MovementRow key={mov.id} item={mov} currencyCode={currencyCode} />
            ))
          )}

          <View className="h-6" />
        </ScrollView>

        {/* ── Botón de cierre ── */}
        <View className="pb-safe pt-2">
          <Button
            onPress={() => setShowCloseDialog(true)}
          >
            Hacer corte de caja
          </Button>
        </View>
      </Layout>

      {/* ── Dialog: Cerrar caja ── */}
      <Dialog
        visible={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title="Corte de caja"
      >
        <View className="gap-4">
          <InfoBanner colorScheme="info">
            Efectivo esperado: {formatCurrency(summary.expected_cash_in_register, currencyCode)}
          </InfoBanner>

          <View>
            <Text className="mb-1 text-sm text-gray-400">Efectivo contado en caja</Text>
            <TextInput
              value={closingAmount}
              onChangeText={setClosingAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
              autoFocus
            />
          </View>

          {closingAmount && Number(closingAmount) >= 0 && (
            <View
              className={`rounded-xl p-3 ${
                Number(closingAmount) === summary.expected_cash_in_register
                  ? 'bg-success-200 border border-success-300'
                  : Number(closingAmount) > summary.expected_cash_in_register
                    ? 'bg-info-200 border border-info-300'
                    : 'bg-error-200 border border-error-300'
              }`}
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-sm">
                  {Number(closingAmount) === summary.expected_cash_in_register
                   ? 'Caja cuadrada'
                    : Number(closingAmount) > summary.expected_cash_in_register
                     ? 'Sobrante'
                     : 'Faltante'}
                </Text>
                <Text className="text-lg font-bold">
                  {formatCurrency(
                    Math.abs(Number(closingAmount) - summary.expected_cash_in_register),
                    currencyCode
                  )}
                </Text>
              </View>
            </View>
          )}

          <View>
            <Text className="mb-1 text-sm text-gray-400">Observaciones (opcional)</Text>
            <TextInput
              value={closingNotes}
              onChangeText={setClosingNotes}
              placeholder="Notas del cierre..."
              multiline
              numberOfLines={2}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-base"
            />
          </View>

          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setShowCloseDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              isPending={closeSession.isPending}
              disabled={!closingAmount || Number(closingAmount) < 0}
              onPress={() => {
                closeSession.mutate(
                  {
                    sessionId: sessionId,
                    actual_closing_amount: Number(closingAmount),
                    notes: closingNotes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowCloseDialog(false);
                      setClosingAmount('');
                      setClosingNotes('');
                      imprimirCorte.mutate({ tipo: 'corte', id: sessionId });
                    },
                  }
                );
              }}
            >
              Cerrar caja
            </Button>
          </View>
        </View>
      </Dialog>

      {/* ── Dialog: Registrar movimiento Manual ── */}
      <Dialog
        visible={showMovementDialog}
        onClose={() => setShowMovementDialog(false)}
        title={movType === 'cash_in' ? 'Entrada de efectivo' : 'Salida de efectivo'}
      >
        <View className="gap-4">
          <View>
            <Text className="mb-1 text-sm text-gray-400">Monto</Text>
            <TextInput
              value={movAmount}
              onChangeText={setMovAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-xl text-center"
              autoFocus
            />
          </View>
          <View>
            <Text className="mb-1 text-sm text-gray-400">Descripción</Text>
            <TextInput
              value={movDescription}
              onChangeText={setMovDescription}
              placeholder={movType === 'cash_in' ? 'Ej: Cambio de billetes' : 'Ej: Retiro parcial'}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-base"
            />
          </View>
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => {
                setShowMovementDialog(false);
                setMovAmount('');
                setMovDescription('');
              }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              isPending={addMovement.isPending}
              disabled={!movAmount || Number(movAmount) <= 0}
              onPress={() => {
                addMovement.mutate(
                  {
                    sessionId: sessionId,
                    type: movType,
                    payment_method: 'cash',
                    amount: Number(movAmount),
                    description: movDescription || undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowMovementDialog(false);
                      setMovAmount('');
                      setMovDescription('');
                      summaryQuery.refetch();
                      movementsQuery.refetch();
                    },
                  }
                );
              }}
            >
              {movType === 'cash_in' ? 'Registrar entrada' : 'Registrar salida'}
            </Button>
          </View>
        </View>
      </Dialog>
    </>
  );
};

// ──────────────────────────────────────────────────
// Main Screen
// ──────────────────────────────────────────────────

export default function CashRegisterScreen() {
  const cashSession = useCurrentCashSession();

  if (cashSession.isLoading) {
    return (
      <Layout>
        <Text className="mt-8 mb-6 text-4xl">Caja</Text>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400">Cargando...</Text>
        </View>
      </Layout>
    );
  }

  if (cashSession.isError) {
    return (
      <Layout>
        <Text className="mt-8 mb-6 text-4xl">Caja</Text>
        <View className="flex-1 items-center justify-center gap-2">
          <InfoBanner variant="ghost" colorScheme="error" className="w-40">
            Error al cargar
          </InfoBanner>
          <Button variant="outline" onPress={() => cashSession.refetch()}>
            Reintentar
          </Button>
        </View>
      </Layout>
    );
  }

  // No hay sesión abierta → mostrar formulario de apertura
  if (!cashSession.data) {
    return <OpenSessionView />;
  }

  // Sesión abierta → mostrar resumen y movimientos
  return <ActiveSessionView sessionId={cashSession.data.id} />;
}
