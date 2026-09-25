/**
 * Renglones de precio variable (la consulta): Caja pone el importe al cobrar.
 * Espejo de backend/src/lib/consulta.ts: la marca vale en el renglón o en su
 * producto. Si el servidor cambia las claves, cambian aquí.
 */
type Meta = Record<string, unknown> | null | undefined;

export type RenglonConPrecio = {
  title?: string | null;
  product_title?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  metadata?: Meta;
  variant?: { product?: { metadata?: Meta } | null } | null;
  product?: { metadata?: Meta } | null;
};

const CLAVE_PRECIO_VARIABLE = 'altus_precio_variable';

export const esPrecioVariable = (r: RenglonConPrecio): boolean =>
  [r.metadata, r.variant?.product?.metadata, r.product?.metadata].some((m) => !!m?.[CLAVE_PRECIO_VARIABLE]);

/** Renglones de precio variable todavía en cero: el servidor no deja cobrar así. */
export const renglonesSinPrecio = (items: RenglonConPrecio[]): string[] =>
  items
    .filter((r) => esPrecioVariable(r) && (r.quantity ?? 1) > 0 && (r.unit_price ?? 0) <= 0)
    .map((r) => r.product_title || r.title || 'Consulta');
