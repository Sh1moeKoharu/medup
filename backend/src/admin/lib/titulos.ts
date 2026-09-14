/**
 * En un catálogo de una sola presentación, Medusa llama «Default» a la
 * variante y el título sale como «Paracetamol 500 mg — Default». Sobra en
 * pantalla, y sale igual en el panel que en el punto de venta (allí vive en
 * `frontend/components/almacen/base.tsx`).
 */
export const sinVarianteUnica = (titulo: string | null | undefined): string =>
    (titulo ?? "").replace(/\s+[—-]\s+Default$/i, "");
