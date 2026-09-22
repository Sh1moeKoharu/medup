import { useMiPerfil } from '@/api/hooks/clinica';
import { InfoBanner } from '@/components/InfoBanner';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { Image, View } from 'react-native';

/**
 * El encabezado de la receta, en la pantalla de inicio del médico: el logotipo
 * y los datos de la clínica, y los del médico que tiene la sesión abierta
 * (nombre, especialidad, cédula, universidad). Es lo mismo que sale impreso en
 * la receta, así que el médico ve de un vistazo si su receta saldrá completa.
 *
 * Los datos los captura Administración al dar de alta al médico; aquí sólo se
 * leen. Si falta la cédula o la universidad, lo dice.
 */

const Logo: React.FC<{ url?: string | null; etiqueta: string }> = ({ url, etiqueta }) =>
  url ? (
    <Image source={{ uri: url }} accessibilityLabel={etiqueta} resizeMode="contain" className="h-12 w-20" />
  ) : null;

export const EncabezadoDeReceta: React.FC<{ className?: string }> = ({ className }) => {
  const miPerfil = useMiPerfil();
  const datos = miPerfil.data;
  if (!datos) return null;

  const p = datos.perfil_profesional ?? {};
  const clinica = datos.clinica;
  const lineaClinica = [clinica.direccion, clinica.telefono ? `Tel. ${clinica.telefono}` : null].filter(Boolean).join(' · ');
  const cedulas = [
    p.cedula_profesional ? `Céd. prof. ${p.cedula_profesional}` : null,
    p.cedula_especialidad ? `Céd. esp. ${p.cedula_especialidad}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const consultorio = [p.consultorio_nombre, p.consultorio_direccion, p.telefono ? `Tel. ${p.telefono}` : null].filter(Boolean).join(' · ');

  return (
    <View className={clx('gap-3 rounded-2xl border border-gray-200 bg-white p-4', className)}>
      <View className="flex-row items-center gap-3 border-b border-gray-200 pb-3">
        <Logo url={clinica.logo_url} etiqueta={`Logotipo de ${clinica.establecimiento}`} />
        <View className="flex-1">
          <Text className="text-lg" numberOfLines={1}>{clinica.establecimiento}</Text>
          {!!lineaClinica && <Text className="text-xs text-gray-500" numberOfLines={2}>{lineaClinica}</Text>}
        </View>
        <Logo url={p.logo_url} etiqueta={`Logotipo de ${datos.nombre}`} />
      </View>
      <View className="flex-row flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <View className="min-w-[180px] flex-1">
          <Text className="text-base font-semibold">{datos.nombre}</Text>
          <Text className="text-sm text-gray-500">{p.especialidad || datos.rol_etiqueta}</Text>
          {!!p.universidad && <Text className="text-xs text-gray-500">{p.universidad}</Text>}
        </View>
        <View className="items-end">
          {!!cedulas && <Text className="text-sm">{cedulas}</Text>}
          {!!consultorio && <Text className="text-xs text-gray-500">{consultorio}</Text>}
        </View>
      </View>
      {!datos.perfil_completo && (
        <InfoBanner colorScheme="warning">
          A tu receta le falta la cédula profesional o la universidad. Pide a Administración que las capture en tu cuenta.
        </InfoBanner>
      )}
    </View>
  );
};
