import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import { formatearDinero } from '@/utils/dinero';
import * as React from 'react';
import { ActivityIndicator, TextInput, TouchableOpacity, View } from 'react-native';

/**
 * El precio de la consulta, escrito por Caja en el propio renglón.
 *
 * ── POR QUÉ AQUÍ Y NO EN UN DIÁLOGO ─────────────────────────────────────────
 * La consulta entra a la cuenta con el precio de referencia (puede ser cero) y
 * Caja lo ajusta en cada cobro: por médico, por convenio, por lo que se acordó
 * en recepción. Un campo en el renglón se ve al primer vistazo y, si está en
 * cero, el cobro no avanza y el renglón lo dice en rojo. El servidor lo vuelve
 * a comprobar (lib/consulta.ts): no es sólo cosa de la pantalla.
 */
export const PrecioVariable: React.FC<{
  precio: number;
  currencyCode?: string;
  guardando: boolean;
  onGuardar: (precio: number) => void;
  /** Quitar el renglón (p. ej. la consulta ya se pagó aparte). */
  onQuitar?: () => void;
}> = ({ precio, currencyCode, guardando, onGuardar, onQuitar }) => {
  const [editando, setEditando] = React.useState(precio <= 0);
  const [texto, setTexto] = React.useState(precio > 0 ? String(precio) : '');
  const valor = Number(texto.replace(',', '.'));
  const valido = Number.isFinite(valor) && valor > 0;

  React.useEffect(() => {
    if (!guardando && precio > 0) {
      setEditando(false);
      setTexto(String(precio));
    }
  }, [precio, guardando]);

  const guardar = () => {
    if (!valido) return;
    onGuardar(Math.round(valor * 100) / 100);
  };

  if (!editando) {
    return (
      <View className="items-end gap-1">
        <Text>{formatearDinero(precio, currencyCode)}</Text>
        <TouchableOpacity onPress={() => setEditando(true)} accessibilityLabel="Cambiar el precio de la consulta">
          <Text className="text-sm text-info-500">Cambiar precio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="items-end gap-1">
      <Text className="text-xs text-error-500">{precio <= 0 ? 'Falta el precio' : 'Precio de la consulta'}</Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={texto}
          onChangeText={setTexto}
          onSubmitEditing={guardar}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={color.textoTerciario}
          accessibilityLabel="Precio de la consulta"
          className="w-28 rounded-xl border border-gray-300 bg-white px-3 py-2 text-right text-base"
          autoFocus={precio <= 0}
        />
        <TouchableOpacity
          onPress={guardar}
          disabled={!valido || guardando}
          accessibilityLabel="Poner precio"
          className={`rounded-full px-4 py-2 ${valido && !guardando ? 'bg-black' : 'bg-gray-200'}`}
        >
          {guardando ? <ActivityIndicator color="white" /> : <Text className={`text-sm font-semibold ${valido ? 'text-white' : 'text-gray-500'}`}>Poner</Text>}
        </TouchableOpacity>
      </View>
      <View className="flex-row gap-3">
        {precio > 0 && (
          <TouchableOpacity onPress={() => setEditando(false)} disabled={guardando}>
            <Text className="text-sm text-gray-500">Cancelar</Text>
          </TouchableOpacity>
        )}
        {onQuitar && (
          <TouchableOpacity onPress={onQuitar} disabled={guardando} accessibilityLabel="Quitar la consulta de la cuenta">
            <Text className="text-sm text-gray-500">Quitar</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
