import { Kardex } from '@/components/almacen/Kardex';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** El kardex de los dos almacenes, para revisar mermas y ajustes. */
export default function KardexDeAuditoriaScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Kardex descripcion="Cada movimiento de los dos almacenes, con su lote y quién lo hizo. «Mermas» aísla caducidades y bajas por daño." />
    </LayoutWithScroll>
  );
}
