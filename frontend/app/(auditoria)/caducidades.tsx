import { Caducidades } from '@/components/almacen/Caducidades';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** Caducidades de los dos almacenes, con exportación a CSV por almacén. */
export default function CaducidadesDeAuditoriaScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Caducidades />
    </LayoutWithScroll>
  );
}
