import { Reportes } from '@/components/reportes/Reportes';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** Reportes para Excel o impresión; el catálogo depende del perfil. */
export default function ReportesScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Reportes />
    </LayoutWithScroll>
  );
}
