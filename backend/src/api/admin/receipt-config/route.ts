import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";

/**
 * Contenido configurable del ticket de venta.
 *
 *   GET  /admin/receipt-config
 *   POST /admin/receipt-config
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El ticket salía encabezado con "Medusa Store", que es el nombre por omisión
 * del motor. Cambiar eso a mano en el código serviría para esta clínica y para
 * ninguna otra, y además cada negocio necesita poner cosas distintas: su
 * razón social, domicilio, RFC, teléfono, o una leyenda al pie.
 *
 * ── DÓNDE SE GUARDA ─────────────────────────────────────────────────────────
 * En `store.metadata.recibo`. Es configuración del negocio, va con el negocio,
 * y no hace falta una tabla nueva para cinco campos de texto.
 *
 * ── LO QUE NO ES ────────────────────────────────────────────────────────────
 * Poner el RFC aquí NO convierte el ticket en una factura. El CFDI 4.0 exige
 * timbrado con un PAC. El RFC aparece porque los negocios lo imprimen para que
 * el cliente pueda pedir su factura después, y el ticket conserva la leyenda
 * de que no es comprobante fiscal.
 */

export type ConfiguracionRecibo = {
  /** Encabezado. Si está vacío se usa el nombre de la tienda. */
  nombre: string;
  direccion: string;
  telefono: string;
  rfc: string;
  /** Texto libre al final del ticket. */
  pie: string;
};

export const RECIBO_POR_OMISION: ConfiguracionRecibo = {
  nombre: "",
  direccion: "",
  telefono: "",
  rfc: "",
  pie: "Gracias por su compra",
};

/** Sólo estas claves se leen y se guardan; cualquier otra cosa se descarta. */
const CAMPOS: (keyof ConfiguracionRecibo)[] = [
  "nombre",
  "direccion",
  "telefono",
  "rfc",
  "pie",
];

/** Un ticket de 80mm no admite líneas largas: se recortan en lugar de deformarlo. */
const LARGO_MAXIMO = 200;

export function leerConfiguracion(metadata: any): ConfiguracionRecibo {
  const guardado = (metadata?.recibo ?? {}) as Record<string, unknown>;
  const salida = { ...RECIBO_POR_OMISION };

  for (const campo of CAMPOS) {
    const valor = guardado[campo];
    if (typeof valor === "string") {
      salida[campo] = valor;
    }
  }

  return salida;
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const storeService: any = req.scope.resolve(Modules.STORE);
    const [tienda] = await storeService.listStores({});

    if (!tienda) {
      return res.status(404).json({ message: "No hay una tienda configurada." });
    }

    res.json({
      configuracion: leerConfiguracion(tienda.metadata),
      nombre_tienda: tienda.name ?? null,
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const storeService: any = req.scope.resolve(Modules.STORE);
    const [tienda] = await storeService.listStores({});

    if (!tienda) {
      return res.status(404).json({ message: "No hay una tienda configurada." });
    }

    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    const actual = leerConfiguracion(tienda.metadata);
    const nueva = { ...actual };

    for (const campo of CAMPOS) {
      if (campo in cuerpo) {
        const valor = cuerpo[campo];
        if (typeof valor !== "string") {
          return res.status(400).json({
            message: `El campo "${campo}" debe ser texto.`,
          });
        }
        nueva[campo] = valor.trim().slice(0, LARGO_MAXIMO);
      }
    }

    await storeService.updateStores(tienda.id, {
      // Se conserva el resto de metadata: aquí puede haber datos de otras
      // partes del sistema y sustituir el objeto entero los borraría.
      metadata: { ...(tienda.metadata ?? {}), recibo: nueva },
    });

    res.json({ configuracion: nueva });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
}
