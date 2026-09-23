import { EncabezadoDeReceta } from '@/components/receta/EncabezadoDeReceta';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Text } from '@/components/ui/Text';
import type { RenglonReceta } from '@/contexts/receta';
import * as React from 'react';
import { ScrollView, View } from 'react-native';

/**
 * La receta tal como va a salir, ANTES de enviarla.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Antes se pulsaba «Emitir» y salía un cuadro de texto —"¿Emitir esta
 * receta?"— que no enseñaba nada de la receta. El médico veía el documento
 * por primera vez ya impreso, cuando corregirlo significa cancelar y volver a
 * emitir. Aquí ve exactamente lo que va a recibir Enfermería y lo que se va a
 * imprimir: su encabezado con la cédula, el paciente, cada medicamento con su
 * indicación y las notas. Si algo está mal, «Corregir» vuelve sin perder nada.
 *
 * El encabezado es el MISMO componente que sale en el catálogo y en el
 * documento impreso: no hay una versión "de vista previa" que pueda
 * desviarse de la real.
 */

const hoy = () => new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

export const VistaPreviaDeReceta: React.FC<{
  visible: boolean;
  paciente: string;
  renglones: RenglonReceta[];
  notas: string;
  aEnfermeria: boolean;
  enviando: boolean;
  onEnviar: () => void;
  onCorregir: () => void;
}> = ({ visible, paciente, renglones, notas, aEnfermeria, enviando, onEnviar, onCorregir }) => (
  <Dialog visible={visible} onClose={onCorregir} title="Vista previa de la receta" containerClassName="max-w-2xl" showCloseButton dismissOnOverlayPress>
    <ScrollView showsVerticalScrollIndicator={false} className="max-h-[60vh]" contentContainerClassName="gap-3">
      <EncabezadoDeReceta />

      <View className="flex-row flex-wrap justify-between gap-x-6 gap-y-1 rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <View>
          <Text className="text-xs text-gray-400">Paciente</Text>
          <Text className="text-base font-semibold">{paciente}</Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-gray-400">Fecha</Text>
          <Text className="text-base">{hoy()}</Text>
        </View>
      </View>

      <View className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
        <Text className="mb-2 text-xs text-gray-400">Prescripción</Text>
        {renglones.map((r, i) => (
          <View key={r.id} className={i > 0 ? 'mt-2 border-t border-gray-100 pt-2' : ''}>
            <Text className="text-base">
              {r.quantity} × {r.product_title}
            </Text>
            {!!r.instructions.trim() && <Text className="text-sm text-gray-500">{r.instructions.trim()}</Text>}
          </View>
        ))}
      </View>

      {!!notas.trim() && (
        <View className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <Text className="text-xs text-gray-400">{aEnfermeria ? 'Notas para Enfermería (no se imprimen)' : 'Notas para Farmacia (no se imprimen)'}</Text>
          <Text className="text-sm text-gray-700">{notas.trim()}</Text>
        </View>
      )}

      <Text className="text-sm text-gray-400">
        {aEnfermeria
          ? 'Va a la Bandeja de Enfermería. Lo que apliquen pasará a la cuenta del paciente para que Caja lo cobre.'
          : 'Va a la Bandeja de Farmacia. Farmacia la surtirá y descontará el inventario al entregar.'}{' '}
        Una vez enviada sólo puede cancelarse, no editarse.
      </Text>
    </ScrollView>

    <View className="mt-4 flex-row gap-2">
      <Button variant="outline" className="flex-1" onPress={onCorregir} disabled={enviando}>
        Corregir
      </Button>
      <Button className="flex-1" onPress={onEnviar} isPending={enviando}>
        {aEnfermeria ? 'Enviar a Enfermería' : 'Enviar a Farmacia'}
      </Button>
    </View>
  </Dialog>
);
