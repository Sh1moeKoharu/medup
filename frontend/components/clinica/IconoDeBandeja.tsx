import { useBandeja } from '@/api/hooks/clinica';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { color } from '@/theme/tokens';
import * as React from 'react';
import { View } from 'react-native';

/**
 * El icono de la pestaña Bandeja con el número de órdenes pendientes encima.
 *
 * ── POR QUÉ NO `tabBarBadge` ────────────────────────────────────────────────
 * El número sale de la misma consulta que la bandeja, y esa consulta necesita
 * sesión: `useMedusaSdk` lanza si no la hay. Las opciones de la pestaña se
 * evalúan en el layout, que se monta también durante el instante sin sesión
 * del aterrizaje; ahí no se puede llamar al hook. Un componente sí puede
 * decidir "sin sesión, sin número", así que el contador vive en el icono.
 *
 * Comparte la caché con la pantalla: no es una segunda consulta al servidor.
 */
const Contador: React.FC = () => {
  const bandeja = useBandeja('nursing');
  const n = bandeja.data?.length ?? 0;
  if (n === 0) return null;
  return (
    <View
      accessibilityLabel={`${n} pendientes`}
      style={{
        position: 'absolute',
        top: -6,
        right: -10,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        backgroundColor: color.iconoError,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: color.textoSobreTinta }}>{n > 99 ? '99+' : n}</Text>
    </View>
  );
};

export const IconoDeBandeja: React.FC<{ color: string; size?: number }> = ({ color: tinta, size = 20 }) => {
  const { state } = useAuthCtx();
  return (
    <View>
      <ClipboardList size={size} color={tinta} />
      {state.status === 'authenticated' && <Contador />}
    </View>
  );
};
