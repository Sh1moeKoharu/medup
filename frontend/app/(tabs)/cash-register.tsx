import {
  useCurrentCashSession,
  useOpenCashSession,
  useCloseCashSession,
  useCashSessionSummary,
  useCashMovements,
  useAddCashMovement,
  CashMovement,
} from '@/api/hooks/cash-session';
import { CircleAlert } from '@/components/icons/circle-alert';
import { Check } from '@/components/icons/check';
import { Plus } from '@/components/icons/plus';
import { Minus } from '@/components/icons/minus';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useSettings } from '@/contexts/settings';
import { FlashList } from '@shopify/flash-list';
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

const formatCurrency = (amount: number, currencyCode?: string) =>
  amount.toLocaleString('es-MX', {
    style: 'currency',
    currency: currencyCode || 'MXN',
    currencyDisplay: 'narrowSymbol',
  });

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
  sale: { label: 'Venta', color: 'text-green-600', sign: '+' },
  refund: { label: 'Reembolso', color: 'text-red-500', sign: '-' },
  cash_in: { label: 'Entrada', color: 'text-blue-600', sign: '+' },
  cash_out: { label: 'Salida', color: 'text-orange-500', sign: '-' },
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
}> = ({ label, value, currencyCode, highlight, negative }) => (
  <View
    className={`flex-1 rounded-xl p-3 ${
      highlight ? 'bg-black' : negative ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
    }`}
  >
    <Text className={`text-xs ${highlight ? 'text-gray-400' : 'text-gray-400'}`}>{label}</Text>
    <Text className={`text-lg font-bold ${highlight ? 'text-white' : negative ? 'text-red-600' : 'text-black'}`}>
      {formatCurrency(value, currencyCode)}
    </Text>
  </View>
);

// ──────────────────────────────────────────────────
// Open Session Form
// ──────────────────────────────────────────────────

const OpenSessionView: React.FC = () => {
  const settings = useSettings();
  const openSession = useOpenCashSession();
  const [openingAmount, setOpeningAmount] = useState('');
  const [cashierName, setCashierName] = useState('');

  return (
    <Layout>
      <Text className="mt-8 mb-6 text-4xl">Caja</Text>

      <View className="flex-1 items-center justify-center gap-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-gray-50">
        </View>
        <Text className="text-xl font-medium">La caja está cerrada</Text>
        <Text className="text-center text-gray-400">
          Abre una sesión de caja para comenzar{'\n'}a registrar ventas y movimientos.
        </Text>

        <View className="w-full max-w-sm gap-3 mt-4">
          <View>
            <Text className="mb-1 text-sm text-gray-400">Nombre del cajero</Text>
            <TextInput
              value={cashierName}
              onChangeText={setCashierName}
              placeholder="Ej: Ana García"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-base"
            />
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
              openSession.mutate({
                opening_amount: Number(openingAmount) || 0,
                cashier_name: cashierName || 'Cajero',
                sales_channel_id: settings.data?.sales_channel?.id,
              })
            }
            isPending={openSession.isPending}
            disabled={!cashierName.trim()}
          >
            Abrir Caja
          </Button>
        </View>
      </View>
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
            <View className="h-2 w-2 rounded-full bg-green-500" />
            <Text className="text-sm text-gray-400">
              Abierta por {session.cashier_name} · {formatDateTime(session.opened_at)}
            </Text>
          </View>

          {/* ── Resumen Principal ── */}
          <View className="mb-4 flex-row gap-2">
            <SummaryCard label="Total Ventas" value={summary.sales_total} currencyCode={currencyCode} highlight />
            <SummaryCard label="Transacciones" value={summary.transaction_count} currencyCode={currencyCode} />
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
                  <Text className="text-sm text-red-500">Reembolsos</Text>
                  <Text className="text-sm font-medium text-red-500">
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
          <Text className="mb-2 text-lg font-medium">Últimos Movimientos</Text>
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
            Hacer Corte de Caja
          </Button>
        </View>
      </Layout>

      {/* ── Dialog: Cerrar Caja ── */}
      <Dialog
        visible={showCloseDialog}
        onClose={() => setShowCloseDialog(false)}
        title="Corte de Caja"
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
                  ? 'bg-green-50 border border-green-200'
                  : Number(closingAmount) > summary.expected_cash_in_register
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-red-50 border border-red-200'
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
                    },
                  }
                );
              }}
            >
              Cerrar Caja
            </Button>
          </View>
        </View>
      </Dialog>

      {/* ── Dialog: Registrar Movimiento Manual ── */}
      <Dialog
        visible={showMovementDialog}
        onClose={() => setShowMovementDialog(false)}
        title={movType === 'cash_in' ? 'Entrada de Efectivo' : 'Salida de Efectivo'}
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
              {movType === 'cash_in' ? 'Registrar Entrada' : 'Registrar Salida'}
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
