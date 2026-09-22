import { CortesDeCaja } from '@/components/caja/CortesDeCaja';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** Los cortes de caja, de sólo lectura, con el corte impreso y el agregado por periodo. */
export default function CortesScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <CortesDeCaja />
    </LayoutWithScroll>
  );
}
