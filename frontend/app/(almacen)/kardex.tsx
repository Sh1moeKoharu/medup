import { Kardex } from '@/components/almacen/Kardex';
import { LayoutWithScroll } from '@/components/ui/Layout';
import React from 'react';

/** El kardex desde Farmacia: para cuadrar lo que salió y entró en su almacén. */
export default function KardexDeAlmacenScreen() {
  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Kardex descripcion="Cada movimiento de inventario con su lote y quién lo hizo. Se escribe solo, desde el servidor; aquí sólo se consulta." />
    </LayoutWithScroll>
  );
}
