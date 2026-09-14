import { Button } from '@/components/ui/Button';
import { PantallaDeAviso, ParrafoDeAviso } from '@/components/ui/PantallaDeAviso';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { roleLabel } from '@/constants/roles';
import React from 'react';

/**
 * Pantalla para quien inicia sesión en el punto de venta sin un rol que el
 * sistema reconozca.
 *
 * Hasta la fase 7 llegaba aquí también Auditoría, con un botón al panel.
 * Ya no: los seis perfiles tienen interfaz en el punto de venta, y el panel
 * lo cierra el servidor a todo el que no sea Administración, así que un
 * botón al panel llevaría a una negativa. Sólo queda el caso de la cuenta sin
 * rol, o con uno que no se puede interpretar.
 *
 * Antes esa cuenta acababa en la interfaz de CAJA, que era el valor por
 * omisión. Una pantalla que dice qué pasa es mejor que dejar a alguien
 * delante de una caja registradora que no le toca.
 */
export default function SinPosScreen() {
  const { state, logout } = useAuthCtx();
  const rol = state.status === 'authenticated' ? state.user.role : null;
  const nombre = state.status === 'authenticated' ? state.user.name : '';

  return (
    <PantallaDeAviso
      titulo="Esta cuenta no tiene perfil"
      acciones={
        <Button variant="outline" onPress={() => logout()}>
          Cerrar sesión
        </Button>
      }
      pie={
        <Text className="text-sm text-gray-400">
          Pide a un administrador que revise tu perfil en Personal: la cuenta
          {rol ? ` tiene el rol «${roleLabel(rol)}», que` : ''} no corresponde a ninguna
          interfaz del punto de venta.
        </Text>
      }
    >
      <ParrafoDeAviso>
        {nombre ? `${nombre}, tu ` : 'Tu '}cuenta no tiene un rol asignado que el sistema
        reconozca, así que no hay pantallas que enseñarte.
      </ParrafoDeAviso>

      <ParrafoDeAviso>
        Caja, Farmacia, Médico, Enfermería y Auditoría tienen cada uno su interfaz
        aquí; Administración, además, el panel.
      </ParrafoDeAviso>
    </PantallaDeAviso>
  );
}
