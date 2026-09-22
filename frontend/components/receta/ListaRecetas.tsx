import { HistorialDeAjustes } from '@/components/clinica/Ajustes';
import { EstadoOrdenMedica, OrdenMedica, useCancelarOrdenMedica, useOrdenesMedicas } from '@/api/hooks/medical-orders';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { InfoBanner } from '@/components/InfoBanner';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useAuthenticated } from '@/contexts/auth';
import { clx } from '@/utils/clx';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import * as React from 'react';
import { Pressable, View } from 'react-native';

/**
 * "Mis recetas": lo que este médico o enfermera ha emitido, con su estado en
 * Farmacia. Es la respuesta a "¿ya la surtieron?" sin tener que preguntar, y
 * permite cancelar una receta pendiente si se emitió por error.
 *
 * El filtro por prescriptor es del servidor (`creator_id`), así que cada quien
 * ve sólo lo suyo. El administrador, que acompaña al personal, ve lo suyo aquí
 * y todo lo demás en el panel.
 */

const ETIQUETA: Record<EstadoOrdenMedica, { texto: string; clase: string }> = {
  pending: { texto: 'Pendiente en Farmacia', clase: 'bg-warning-200 text-warning-500' },
  dispensed: { texto: 'Surtida', clase: 'bg-success-200 text-success-500' },
  cancelled: { texto: 'Cancelada', clase: 'bg-gray-100 text-gray-500' },
};

/**
 * La etiqueta dice DÓNDE está pendiente: una orden a Enfermería no la surte
 * Farmacia, la aplica Enfermería en consulta. Decía «Pendiente en Farmacia»
 * para las dos y se vio en el manual del médico.
 */
const etiquetaDe = (orden: OrdenMedica) => {
  const base = ETIQUETA[orden.status] ?? ETIQUETA.pending;
  if (orden.status === 'pending' && orden.recipient_area === 'nursing') return { ...base, texto: 'Pendiente en Enfermería' };
  if (orden.status === 'dispensed' && orden.recipient_area === 'nursing') return { ...base, texto: 'Aplicada en consulta' };
  return base;
};

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const TarjetaReceta: React.FC<{ orden: OrdenMedica; onCancelar: (o: OrdenMedica) => void }> = ({ orden, onCancelar }) => {
  const [abierta, setAbierta] = React.useState(false);
  const etiqueta = etiquetaDe(orden);
  const unidades = orden.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Pressable
      onPress={() => setAbierta((a) => !a)}
      className="gap-2 rounded-2xl border border-gray-200 bg-white p-4"
      accessibilityRole="button"
      accessibilityLabel={`Receta de ${orden.customer_name ?? 'paciente'}, ${etiqueta.texto}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-lg">{orden.customer_name || orden.customer_id}</Text>
          <Text className="text-sm text-gray-400">
            {fechaCorta(orden.created_at)} · {orden.items.length} {orden.items.length === 1 ? 'medicamento' : 'medicamentos'} · {unidades} u.
          </Text>
        </View>
        <View className={clx('rounded-full px-3 py-1', etiqueta.clase.split(' ')[0])}>
          <Text className={clx('text-xs', etiqueta.clase.split(' ')[1])}>{etiqueta.texto}</Text>
        </View>
      </View>

      {abierta && (
        <View className="mt-2 gap-2 border-t border-gray-100 pt-3">
          {orden.items.map((i) => (
            <View key={i.id} className="flex-row gap-2">
              <Text className="w-10 text-gray-400">{i.quantity}×</Text>
              <View className="flex-1">
                <Text>{i.product_title ?? i.variant_id}</Text>
                {!!i.instructions && <Text className="text-sm text-gray-400">{i.instructions}</Text>}
              </View>
            </View>
          ))}
          {!!orden.notes && <Text className="text-sm text-gray-400">Notas para Enfermería: {orden.notes}</Text>}
          <HistorialDeAjustes ajustes={orden.ajustes} />
          <Text className="text-xs text-gray-300">Folio {orden.id}</Text>
          {orden.status === 'pending' && (
            <Button variant="outline" className="mt-2 self-start px-4 py-3" onPress={() => onCancelar(orden)}>
              Cancelar receta
            </Button>
          )}
        </View>
      )}
    </Pressable>
  );
};

export function ListaRecetas() {
  const { user } = useAuthenticated();
  const ordenes = useOrdenesMedicas({ creator_id: user.id });
  const cancelar = useCancelarOrdenMedica();
  const [aCancelar, setACancelar] = React.useState<OrdenMedica | null>(null);

  const renderItem = React.useCallback<ListRenderItem<OrdenMedica>>(
    ({ item }) => <TarjetaReceta orden={item} onCancelar={setACancelar} />,
    [],
  );

  return (
    <>
      <Layout className="pb-6">
        <Text className="mt-8 mb-6 text-4xl">Mis recetas</Text>

        {ordenes.isError ? (
          <View className="flex-1 items-center justify-center gap-2">
            <InfoBanner variant="ghost" colorScheme="error">
              No se pudieron cargar las recetas
            </InfoBanner>
            <Button variant="outline" onPress={() => ordenes.refetch()} isPending={ordenes.isRefetching}>
              Reintentar
            </Button>
          </View>
        ) : ordenes.data && ordenes.data.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-1">
            <ClipboardList size={24} />
            <Text className="text-xl">Aún no ha emitido recetas</Text>
            <Text className="text-center text-gray-400">Las recetas emitidas y su estado en Farmacia aparecerán aquí</Text>
          </View>
        ) : (
          <FlashList
            data={ordenes.data ?? []}
            keyExtractor={(o) => o.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View className="h-3" />}
            refreshing={ordenes.isRefetching}
            onRefresh={() => ordenes.refetch()}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Layout>

      <Prompt
        visible={!!aCancelar}
        onClose={() => setACancelar(null)}
        title="¿Cancelar esta receta?"
        description={`La receta de ${aCancelar?.customer_name ?? 'este paciente'} dejará de aparecer en la Bandeja de Farmacia. Esta acción no se puede deshacer.`}
        submitText="Cancelar receta"
        cancelText="Conservar"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          if (!aCancelar) return;
          cancelar.mutate(
            { id: aCancelar.id, motivo: 'Cancelada por el prescriptor desde el POS' },
            { onSettled: () => setACancelar(null) },
          );
        }}
      />
    </>
  );
}
