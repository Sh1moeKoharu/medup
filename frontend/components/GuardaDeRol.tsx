import { RUTA_SIN_POS } from '@/constants/acceso';
import { Role, normalizeRole } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import { getHomeRoute } from '@/utils/home-route';
import { Redirect } from 'expo-router';
import * as React from 'react';

/**
 * Deja pasar sólo a los roles que trabajan en este grupo de pantallas.
 *
 * A quien no le corresponde se le manda a SU pantalla, no se le muestra un
 * error: llegó ahí por un enlace o por el historial del navegador, no por
 * intentar colarse.
 *
 * No entra en bucle porque el destino sale de la misma tabla que el permiso
 * (constants/acceso.ts): a nadie se le redirige a un grupo donde tampoco pueda
 * estar.
 */
export const GuardaDeRol: React.FC<{
  permitidos: Role[];
  children: React.ReactNode;
}> = ({ permitidos, children }) => {
  const { state } = useAuthCtx();

  // Sin sesión no decide nada: de eso ya se ocupa el guardia del navegador
  // principal, y adelantarse aquí provocaría dos redirecciones peleándose.
  if (state.status !== 'authenticated') {
    return <>{children}</>;
  }

  const rol = normalizeRole(state.user.role);

  if (rol && permitidos.includes(rol)) {
    return <>{children}</>;
  }

  // Rol desconocido o de otra área. Un rol que no se entiende NO cae en caja.
  const destino = rol ? getHomeRoute(state.user.role) : RUTA_SIN_POS;
  return <Redirect href={destino as any} />;
};
