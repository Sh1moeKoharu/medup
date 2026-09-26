import { Aseguranza, AseguranzaDePaciente, useAseguranzas, useAseguranzasDePaciente } from '@/api/hooks/aseguranzas';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import * as React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';

/**
 * Las aseguranzas de un paciente: para verlas en la ficha y para marcarlas
 * en el alta. El catálogo lo administra el panel; aquí sólo se elige cuáles
 * tiene el paciente y con qué número de póliza.
 */

const nombresDe = (lista: AseguranzaDePaciente[], catalogo: Aseguranza[] | undefined) =>
  lista.map((l) => {
    const a = catalogo?.find((c) => c.id === l.insurance_id);
    return `${a?.name ?? 'Aseguranza'}${l.policy_number ? ` · póliza ${l.policy_number}` : ''}${a ? ` · ${a.discount_percent}% en medicamentos` : ''}`;
  });

/** Sólo lectura, para la ficha. Las lee por la ruta propia; no pinta nada si el paciente no tiene. */
export const AseguranzasDelPaciente: React.FC<{ customerId: string; className?: string }> = ({ customerId, className }) => {
  const catalogo = useAseguranzas();
  const propias = useAseguranzasDePaciente(customerId);
  const lista = propias.data ?? [];
  if (!lista.length) return null;
  return (
    <View className={className}>
      {nombresDe(lista, catalogo.data).map((t, i) => (
        <Text key={i} className="text-sm text-gray-700">
          Aseguranza: {t}
        </Text>
      ))}
    </View>
  );
};

/** Para el alta y la edición: marca cuáles tiene y su póliza. */
export const SelectorDeAseguranzas: React.FC<{
  valor: AseguranzaDePaciente[];
  onChange: (lista: AseguranzaDePaciente[]) => void;
}> = ({ valor, onChange }) => {
  const catalogo = useAseguranzas();
  const lista = catalogo.data ?? [];
  if (!lista.length) return null;

  const alternar = (a: Aseguranza) => {
    const tiene = valor.some((v) => v.insurance_id === a.id);
    onChange(tiene ? valor.filter((v) => v.insurance_id !== a.id) : [...valor, { insurance_id: a.id, policy_number: null }]);
  };
  const poliza = (a: Aseguranza, policy_number: string) => {
    onChange(valor.map((v) => (v.insurance_id === a.id ? { ...v, policy_number: policy_number || null } : v)));
  };

  return (
    <View className="gap-2">
      <Text className="text-sm text-gray-500">Aseguranzas (descuento sólo a medicamentos)</Text>
      {lista.map((a) => {
        const propia = valor.find((v) => v.insurance_id === a.id);
        return (
          <View key={a.id} className="gap-2">
            <TouchableOpacity
              onPress={() => alternar(a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!propia }}
              accessibilityLabel={`Aseguranza ${a.name}`}
              className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${propia ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white'}`}
            >
              <Text className={propia ? 'font-semibold' : ''}>{a.name}</Text>
              <Text className="text-sm text-gray-500">{a.discount_percent}%</Text>
            </TouchableOpacity>
            {propia && (
              <TextInput
                value={propia.policy_number ?? ''}
                onChangeText={(t) => poliza(a, t)}
                placeholder="Número de póliza (opcional)"
                placeholderTextColor={color.textoTerciario}
                accessibilityLabel={`Póliza de ${a.name}`}
                autoCapitalize="characters"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base"
              />
            )}
          </View>
        );
      })}
    </View>
  );
};
