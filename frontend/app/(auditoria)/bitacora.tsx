import { Bitacora } from '@/components/bitacora/Bitacora';
import { Layout } from '@/components/ui/Layout';
import React from 'react';

/**
 * La bitácora para Auditoría: la misma pieza que «Actividad» en la interfaz
 * de Caja, con los filtros de fecha y perfil, y «Ayer» para el caso más
 * frecuente («todo lo que hizo Caja ayer»).
 */
export default function BitacoraScreen() {
  return (
    <Layout>
      <Bitacora
        titulo="Bitácora"
        descripcion="Todo lo que hace el personal, encadenado por huella digital. Las lecturas de expedientes también quedan."
      />
    </Layout>
  );
}
