import { Caducidades } from '@/components/almacen/Caducidades';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** Caducidades desde Farmacia: qué retirar, qué mover primero, y el CSV. */
export default function CaducidadesDeAlmacenScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Caducidades />
    </LayoutWithScroll>
  );
}
