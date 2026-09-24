import { useEscribirNota, useImprimirDocumento, useNotasDeAtencion } from '@/api/hooks/clinica';
import { TarjetaDeNota } from '@/components/clinica/TarjetaDeNota';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import * as React from 'react';
import { TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * La nota de atención de una consulta: se escribe una vez, queda en el
 * expediente y sale por la impresora para el expediente físico.
 *
 * La usan el médico (después de emitir la receta) y Enfermería (después de
 * aplicar la orden). Si ya hay notas de esa orden, se enseñan y se pueden
 * reimprimir; siempre se puede añadir otra.
 */
export const NotaDeAtencion: React.FC<{
  customerId: string;
  medicalOrderId?: string;
  /** Texto pequeño bajo el título, p. ej. el nombre del paciente. */
  contexto?: string;
}> = ({ customerId, medicalOrderId, contexto }) => {
  const notas = useNotasDeAtencion(medicalOrderId ? { medical_order_id: medicalOrderId } : { customer_id: customerId });
  const escribir = useEscribirNota();
  const imprimir = useImprimirDocumento();
  const [texto, setTexto] = React.useState('');

  const guardar = (yLuegoImprimir: boolean) => {
    escribir.mutate(
      { customer_id: customerId, content: texto.trim(), medical_order_id: medicalOrderId },
      {
        onSuccess: (nota) => {
          setTexto('');
          Toast.show({ type: 'success', text1: 'Nota guardada en el expediente' });
          if (yLuegoImprimir) imprimir.mutate({ tipo: 'nota', id: nota.id });
        },
      },
    );
  };

  const lista = notas.data ?? [];
  const listo = texto.trim().length >= 5;

  return (
    <View className="gap-3 rounded-2xl border border-gray-200 bg-white p-4">
      <View>
        <Text className="text-xl">Nota de atención</Text>
        {!!contexto && <Text className="text-sm text-gray-400">{contexto}</Text>}
      </View>

      {lista.map((n) => (
        <TarjetaDeNota key={n.id} nota={n} conImprimir />
      ))}

      <TextInput
        value={texto}
        onChangeText={setTexto}
        placeholder="Qué se atendió, qué se aplicó, cómo respondió el paciente…"
        placeholderTextColor={color.textoTerciario}
        multiline
        className="min-h-[96px] w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base"
      />
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" disabled={!listo} isPending={escribir.isPending} onPress={() => guardar(false)}>
          Guardar
        </Button>
        <Button className="flex-1" disabled={!listo} isPending={escribir.isPending} onPress={() => guardar(true)}>
          Guardar e imprimir
        </Button>
      </View>
    </View>
  );
};
