import { Role, normalizeRole } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';

/** Rol canónico de la sesión, o null si no hay sesión o no se reconoce. */
export const useRol = (): Role | null => {
  const { state } = useAuthCtx();
  return state.status === 'authenticated' ? normalizeRole(state.user.role) : null;
};

/** ¿La sesión tiene alguno de estos roles? Sólo decide qué se enseña; el permiso lo aplica el servidor. */
export const useTieneRol = (roles: Role[]): boolean => {
  const rol = useRol();
  return !!rol && roles.includes(rol);
};
