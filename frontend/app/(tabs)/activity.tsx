import { Bitacora } from '@/components/bitacora/Bitacora';
import { CircleAlert } from '@/components/icons/circle-alert';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { ROLES_BITACORA } from '@/constants/acceso';
import { normalizeRole } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import React from 'react';
import { View } from 'react-native';

/**
 * Registro de actividad: quién hizo qué y cuándo.
 *
 * ── ANTES ESTA PANTALLA ERA UNA MAQUETA ─────────────────────────────────────
 * Mostraba un arreglo fijo escrito en el propio archivo —"Cajero 1 (Ana)",
 * "Aspirina 500mg", horas inventadas— que no consultaba nada. Ahora lee la
 * bitácora real del servidor, que es la que va encadenada por huella digital.
 *
 * La bitácora en sí vive en `components/bitacora/Bitacora.tsx`, porque desde
 * la fase 7 también la monta Auditoría en su propia interfaz. Aquí sólo queda
 * la comprobación de quién puede verla dentro de la interfaz de Caja.
 *
 * ── POR QUÉ NO LA VE TODO EL MUNDO ──────────────────────────────────────────
 * La bitácora sólo la pueden leer Administración y Auditoría: es el registro de
 * lo que hace TODO el personal. La pestaña se oculta a quien no puede leerla,
 * en lugar de enseñarle una pantalla que siempre respondería "prohibido".
 */
export default function ActivityScreen() {
  const { state } = useAuthCtx();
  const rol = state.status === 'authenticated' ? normalizeRole(state.user.role) : null;
  const puedeLeer = !!rol && ROLES_BITACORA.includes(rol);

  // Se llegó por dirección directa sin permiso para leerla.
  if (!puedeLeer) {
    return (
      <Layout>
        <Text className="mt-8 mb-6 text-4xl">Actividad</Text>
        <View className="flex-1 items-center justify-center gap-2 px-4">
          <CircleAlert size={24} />
          <Text className="text-center text-xl">La bitácora es de Administración</Text>
          <Text className="text-center text-gray-400">
            Registra lo que hace todo el personal, así que sólo la consultan Administración y
            Auditoría.
          </Text>
        </View>
      </Layout>
    );
  }

  return (
    <Layout>
      <Bitacora titulo="Actividad" />
    </Layout>
  );
}
