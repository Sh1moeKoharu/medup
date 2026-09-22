import { usePacientesPendientes } from '@/api/hooks/clinica';
import { useCustomers } from '@/api/hooks/customers';
import { ROLES } from '@/constants/roles';
import { useRol } from '@/hooks/useRol';
import type { AdminCustomer } from '@medusajs/types';
import * as React from 'react';

/**
 * Los pacientes con órdenes o recetas pendientes, listos para ponerlos arriba
 * de la lista (punto 16). Sólo para el médico y Enfermería: es a quien hay que
 * atender. Enfermería ve las pendientes de su bandeja; el médico, todas.
 *
 * Se piden aparte, por id, en lugar de ordenar la página cargada: un paciente
 * con una orden pendiente puede no estar en los primeros 20 alfabéticos.
 */
export const usePacientesConPendientes = () => {
  const rol = useRol();
  const aplica = rol === ROLES.DOCTOR || rol === ROLES.NURSE;
  const pendientes = usePacientesPendientes(rol === ROLES.NURSE ? 'nursing' : undefined, { enabled: aplica });
  const conteo = React.useMemo(() => new Map((pendientes.data ?? []).map((p) => [p.customer_id, p.pendientes])), [pendientes.data]);
  const ids = React.useMemo(() => [...conteo.keys()], [conteo]);
  const clientes = useCustomers({ id: ids } as never, 50, { enabled: aplica && ids.length > 0 });
  const lista = React.useMemo(() => {
    const porId = new Map((clientes.data?.pages ?? []).flatMap((p) => p.customers).map((c) => [c.id, c] as const));
    // En el orden de espera que devuelve el servidor.
    return ids.map((id) => porId.get(id)).filter((c): c is AdminCustomer => !!c);
  }, [clientes.data, ids]);

  return { aplica, conteo, lista };
};
