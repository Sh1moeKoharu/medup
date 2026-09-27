import { useAgregarPaquete, usePaquetes } from '@/api/hooks/paquetes';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Text } from '@/components/ui/Text';
import { formatearDinero } from '@/utils/dinero';
import * as React from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * «Paquete» en el carrito: elige uno del catálogo y entra entero, con el
 * precio cerrado repartido entre sus renglones (lo hace el servidor).
 * Si no hay paquetes dados de alta, el botón no aparece.
 */
export const ElegirPaquete: React.FC<{ className?: string }> = ({ className }) => {
  const paquetes = usePaquetes();
  const agregar = useAgregarPaquete();
  const [abierto, setAbierto] = React.useState(false);
  const lista = paquetes.data ?? [];
  if (!lista.length) return null;

  const elegir = (id: string, nombre: string) => {
    agregar.mutate(id, {
      onSuccess: (r) => {
        setAbierto(false);
        Toast.show({ type: 'success', text1: `Paquete ${nombre} en el carrito`, text2: `${r.renglones} renglones a precio cerrado` });
      },
    });
  };

  return (
    <>
      <Button variant="outline" className={className} onPress={() => setAbierto(true)} accessibilityLabel="Añadir paquete">
        Paquete
      </Button>
      <Dialog visible={abierto} onClose={() => setAbierto(false)} title="Añadir un paquete" showCloseButton dismissOnOverlayPress containerClassName="max-w-xl">
        <ScrollView className="max-h-[60vh]" contentContainerClassName="gap-2">
          {lista.map((p) => (
            <TouchableOpacity
              key={p.id}
              onPress={() => elegir(p.id, p.name)}
              disabled={agregar.isPending}
              accessibilityLabel={`Añadir el paquete ${p.name}`}
              className="flex-row items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3"
            >
              <View className="flex-1">
                <Text className="text-base font-semibold">{p.name}</Text>
                {!!p.specialist_name && <Text className="text-sm text-gray-500">{p.specialist_name}</Text>}
                <Text className="text-xs text-gray-400">
                  {[...p.items.map((r) => `${r.quantity} × ${r.product_title ?? 'producto'}`), ...(p.includes_consultation ? ['Consulta'] : [])].join(' · ')}
                </Text>
              </View>
              <Text className="text-base">{formatearDinero(p.price)}</Text>
            </TouchableOpacity>
          ))}
          {agregar.isPending && <ActivityIndicator />}
        </ScrollView>
      </Dialog>
    </>
  );
};
