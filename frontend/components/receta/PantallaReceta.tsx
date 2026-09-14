import { useCrearOrdenMedica } from '@/api/hooks/medical-orders';
import { useImprimirDocumento } from '@/api/hooks/clinica';
import { NotaDeAtencion } from '@/components/clinica/NotaDeAtencion';
import { ChevronDown } from '@/components/icons/chevron-down';
import { CheckCircle } from '@/components/icons/check-circle';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Trash2 } from '@/components/icons/trash-2';
import { UserRoundPlus } from '@/components/icons/user-round-plus';
import { X } from '@/components/icons/x';
import { InfoBanner } from '@/components/InfoBanner';
import { CartSkeleton } from '@/components/skeletons/CartSkeleton';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { QuantityPicker } from '@/components/ui/QuantityPicker';
import { Text } from '@/components/ui/Text';
import { RenglonReceta, useReceta } from '@/contexts/receta';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { color } from '@/theme/tokens';

/**
 * La receta en construcción: paciente, medicamentos con posología y notas.
 *
 * Es la misma pantalla para Médico y Enfermería; cada grupo de rutas la
 * re-exporta. Antes eran dos copias idénticas de 311 líneas del carrito de
 * caja, apoyadas en los pedidos en borrador del POS (ver contexts/receta.tsx
 * para el porqué eso no funcionaba). Aquí NO hay precios: una receta no cobra.
 */

const nombreDe = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Paciente';

// ── Paciente ────────────────────────────────────────────────────────────────

const PacienteBadge: React.FC = () => {
  const receta = useReceta();

  if (!receta.paciente) {
    return (
      <Button
        onPress={() => router.push({ pathname: '/customer-lookup', params: { destino: 'receta' } })}
        variant="outline"
        icon={<UserRoundPlus size={20} />}
        className="mb-6 justify-between"
      >
        Seleccionar paciente
      </Button>
    );
  }

  const p = receta.paciente;

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({ pathname: '/customer-lookup', params: { destino: 'receta', customerId: p.id } })
      }
      className="mb-6 flex-row items-center justify-between border-b border-gray-200 pb-6"
      accessibilityLabel="Cambiar paciente"
    >
      <View className="flex-1">
        <Text className="text-lg">{nombreDe(p)}</Text>
        <Text className="text-sm text-gray-300">
          Paciente{p.phone ? ` · ${p.phone}` : ''}
        </Text>
      </View>
      <View className="flex-row">
        <View className="p-2">
          <ChevronDown size={24} />
        </View>
        <TouchableOpacity onPress={receta.quitarPaciente} className="p-2" accessibilityLabel="Quitar paciente">
          <X size={24} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ── Renglón ─────────────────────────────────────────────────────────────────

const Renglon: React.FC<{ renglon: RenglonReceta }> = ({ renglon }) => {
  const receta = useReceta();

  return (
    <View className="gap-3 bg-white py-5">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-2">
          <Text className="text-base">{renglon.product_title}</Text>
          <QuantityPicker
            quantity={renglon.quantity}
            onQuantityChange={(q) => receta.cambiarCantidad(renglon.id, q)}
            className="self-start"
          />
        </View>
        <Pressable
          onPress={() => receta.quitar(renglon.id)}
          accessibilityLabel={`Quitar ${renglon.product_title} de la receta`}
          className="rounded-xl border border-gray-200 p-2"
        >
          <Trash2 size={18} color={color.iconoError} />
        </Pressable>
      </View>
      <TextInput
        value={renglon.instructions}
        onChangeText={(t) => receta.cambiarIndicaciones(renglon.id, t)}
        placeholder="Indicaciones: p. ej. 1 tableta cada 8 h por 5 días"
        placeholderTextColor={color.textoTerciario}
        multiline
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base"
      />
    </View>
  );
};

const Separador: React.FC = () => <View className="h-hairline bg-gray-200" />;

// ── Pantalla ────────────────────────────────────────────────────────────────

export function PantallaReceta({ isSidebar }: { isSidebar?: boolean }) {
  const receta = useReceta();
  const crear = useCrearOrdenMedica();
  const imprimir = useImprimirDocumento();
  const [confirmando, setConfirmando] = React.useState(false);
  const [emitida, setEmitida] = React.useState<{ id: string; pacienteId: string; paciente: string; renglones: number; destinatario: 'nursing' | 'pharmacy' } | null>(null);
  const aEnfermeria = receta.destinatario !== 'pharmacy';

  const renderItem = React.useCallback<ListRenderItem<RenglonReceta>>(
    ({ item }) => <Renglon renglon={item} />,
    [],
  );
  const keyExtractor = React.useCallback((r: RenglonReceta) => r.id, []);

  const paddingSidebar = isSidebar ? 'px-4 md:px-4 lg:px-4 xl:px-4' : '';
  const faltaPaciente = !receta.paciente;
  const sinRenglones = receta.renglones.length === 0;

  const emitir = () => {
    if (!receta.paciente) return;
    const paciente = receta.paciente;
    crear.mutate(
      {
        customer_id: paciente.id,
        customer_name: nombreDe(paciente),
        notes: receta.notas.trim() || undefined,
        recipient_area: receta.destinatario,
        items: receta.renglones.map((r) => ({
          variant_id: r.variant_id,
          product_title: r.product_title,
          quantity: r.quantity,
          instructions: r.instructions.trim() || undefined,
        })),
      },
      {
        onSuccess: (orden) => {
          setConfirmando(false);
          setEmitida({ id: orden.id, pacienteId: paciente.id, paciente: nombreDe(paciente), renglones: orden.items.length, destinatario: receta.destinatario });
          receta.vaciar();
          Toast.show({ type: 'success', text1: aEnfermeria ? 'Orden enviada a Enfermería' : 'Receta enviada a Farmacia', text2: nombreDe(paciente) });
        },
        onError: () => setConfirmando(false),
      },
    );
  };

  if (receta.cargando) {
    return <CartSkeleton />;
  }

  // ── Confirmación tras emitir ──────────────────────────────────────────────
  if (emitida) {
    return (
      <Layout className={`pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-6">
          <View className="items-center gap-3">
            <CheckCircle size={40} color={color.iconoExito} />
            <Text className="text-center text-xl">
              {emitida.destinatario === 'pharmacy' ? 'Receta enviada a Farmacia' : 'Orden enviada a Enfermería'}
            </Text>
            <Text className="text-center text-gray-400">
              {emitida.paciente} · {emitida.renglones} {emitida.renglones === 1 ? 'medicamento' : 'medicamentos'}
            </Text>
            <Text className="text-center text-sm text-gray-300">Folio {emitida.id}</Text>
          </View>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => imprimir.mutate({ tipo: 'receta', id: emitida.id })} isPending={imprimir.isPending}>
              Imprimir receta
            </Button>
            <Button className="flex-1" onPress={() => setEmitida(null)}>
              Nueva receta
            </Button>
          </View>
          {/* La nota de la consulta se escribe aquí mismo, sin cambiar de pantalla. */}
          <NotaDeAtencion customerId={emitida.pacienteId} medicalOrderId={emitida.id} contexto={emitida.paciente} />
        </ScrollView>
      </Layout>
    );
  }

  // ── Vacía ─────────────────────────────────────────────────────────────────
  if (sinRenglones) {
    return (
      <Layout className={`pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        <PacienteBadge />
        <View className="flex-1 items-center justify-center gap-1">
          <ClipboardList size={24} />
          <Text className="text-xl">Sin medicamentos</Text>
          <Text className="text-center text-gray-400">
            Pulse + en un producto del catálogo para añadirlo a la receta
          </Text>
        </View>
      </Layout>
    );
  }

  return (
    <>
      <Layout className={`flex-1 pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        <PacienteBadge />

        <FlashList
          data={receta.renglones}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Separador}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          ListFooterComponent={
            <View className="mt-4 gap-2">
              {/* A quién va. Decide la bandeja y el almacén; la cuenta del
                  paciente sólo se carga cuando la aplica Enfermería. */}
              <Text className="text-sm text-gray-400">Va a</Text>
              <View className="flex-row gap-2">
                {([
                  ['nursing', 'Enfermería (consulta)'],
                  ['pharmacy', 'Farmacia (mostrador)'],
                ] as const).map(([valor, etiqueta]) => (
                  <Pressable
                    key={valor}
                    onPress={() => receta.cambiarDestinatario(valor)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: receta.destinatario === valor }}
                    className={`flex-1 items-center rounded-xl border px-3 py-3 ${receta.destinatario === valor ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white'}`}
                  >
                    <Text className={receta.destinatario === valor ? 'text-active-500' : 'text-gray-500'}>{etiqueta}</Text>
                  </Pressable>
                ))}
              </View>
              <Text className="mt-2 text-sm text-gray-400">{aEnfermeria ? 'Notas para Enfermería' : 'Notas para Farmacia'}</Text>
              <TextInput
                value={receta.notas}
                onChangeText={receta.cambiarNotas}
                placeholder="Alergias, observaciones, diagnóstico…"
                placeholderTextColor={color.textoTerciario}
                multiline
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base"
              />
            </View>
          }
        />

        <View className="mt-4">
          <View className="mb-4 h-hairline bg-gray-200" />
          {faltaPaciente && (
            <InfoBanner variant="ghost" colorScheme="info" className="mb-3">
              Seleccione al paciente para poder emitir la receta.
            </InfoBanner>
          )}
          <View className="flex-row gap-2 pb-6">
            <Button
              variant="outline"
              onPress={receta.vaciar}
              accessibilityLabel="Vaciar receta"
              className="px-4"
              icon={<Trash2 size={18} />}
            >
              Vaciar
            </Button>
            <Button
              className="flex-1"
              disabled={faltaPaciente || sinRenglones}
              isPending={crear.isPending}
              onPress={() => setConfirmando(true)}
            >
              Emitir receta ({receta.totalUnidades})
            </Button>
          </View>
        </View>
      </Layout>

      <Prompt
        onSubmit={emitir}
        onClose={() => setConfirmando(false)}
        title="¿Emitir esta receta?"
        description={
          aEnfermeria
            ? `Se enviará a la Bandeja de Enfermería a nombre de ${receta.paciente ? nombreDe(receta.paciente) : 'el paciente'}. Enfermería la aplicará en consulta y el consumo pasará a la cuenta del paciente para que Caja lo cobre.`
            : `Se enviará a la Bandeja de Farmacia a nombre de ${receta.paciente ? nombreDe(receta.paciente) : 'el paciente'}. Farmacia la surtirá y descontará el inventario al entregar. Una vez emitida sólo puede cancelarse, no editarse.`
        }
        submitText="Emitir"
        cancelText="Revisar"
        visible={confirmando}
        showCloseButton={true}
        dismissOnOverlayPress={true}
      />
    </>
  );
}
