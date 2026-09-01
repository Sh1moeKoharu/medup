import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { leerConfiguracion, RECIBO_POR_OMISION } from "../../receipt-config/route";

/**
 * GET /admin/receipts/:orderId
 *
 * Devuelve el recibo de una venta, YA ARMADO. El punto de venta sólo lo
 * maqueta e imprime.
 *
 * ── POR QUÉ SE ARMA EN EL SERVIDOR ──────────────────────────────────────────
 * Podría componerse en la tableta con los datos que ya tiene del carrito, y
 * sería menos código. Pero entonces el contenido del comprobante lo decidiría
 * el cliente, y cualquiera con la consola del navegador podría imprimir un
 * ticket con otras cifras o saltarse las reglas de qué se muestra.
 *
 * Aquí además es donde vivirá la política sobre medicamentos controlados
 * (ver RECIBO_OCULTAR_CONTROLADOS más abajo): una regla que se aplica en el
 * servidor no se puede eludir desde el dispositivo.
 *
 * ── ESTE TICKET NO ES UN COMPROBANTE FISCAL ─────────────────────────────────
 * Es un comprobante de venta. La factura electrónica (CFDI 4.0) es otra cosa y
 * exige timbrado con un PAC. Por eso el recibo lleva una leyenda que lo dice:
 * un papel que parece factura y no lo es le causa un problema al cliente.
 */

/**
 * Oculta el nombre de los medicamentos controlados en el ticket del cliente.
 *
 * Apagado por omisión, a propósito. No me consta una norma mexicana que
 * prohíba imprimirlos: lo que regulan la Ley General de Salud (Art. 226
 * fracciones I-III, Art. 245) y el Reglamento de Insumos para la Salud es cómo
 * se PRESCRIBEN y DISPENSAN — receta especial, retención de la receta, libro de
 * control—, no el comprobante que se le entrega al comprador.
 *
 * Lo que sí sostiene ocultarlos es otra cosa: los datos de salud son datos
 * personales sensibles, y un papel con el nombre de alguien junto al de un
 * psicotrópico es divulgación en un medio que se pierde o lo lee quien pasa.
 *
 * Como es una decisión del Responsable Sanitario de la clínica y no nuestra,
 * es una bandera y no una regla cableada.
 *
 * Cuando se enciende, la línea CONSERVA su importe y sólo cambia el nombre. Si
 * se omitiera la línea entera, el ticket dejaría de cuadrar con el total y el
 * cajero no podría explicárselo a nadie.
 */
const OCULTAR_CONTROLADOS = process.env.RECIBO_OCULTAR_CONTROLADOS === "1";

const ETIQUETA_CONTROLADO = "Medicamento controlado";

function esControlado(metadata: any): boolean {
    if (!metadata) return false;
    return (
        String(metadata.clasificacion ?? "").toLowerCase() === "controlado" ||
        metadata.requiere_receta === true
    );
}

/**
 * Datos del negocio, desde la configuración del ticket.
 *
 * "Medusa Store" es el nombre que trae el motor de fábrica; no es el nombre de
 * nadie y no debe salir impreso.
 */
async function leerDatosDelNegocio(req: MedusaRequest) {
    let config = { ...RECIBO_POR_OMISION };
    let nombreTienda = "";

    try {
        const storeService: any = req.scope.resolve(Modules.STORE);
        const tiendas = await storeService.listStores({});
        if (tiendas?.[0]) {
            config = leerConfiguracion(tiendas[0].metadata);
            nombreTienda = tiendas[0].name ?? "";
        }
    } catch {
        // Sin tienda configurada: se sigue con los valores por omisión.
    }

    const nombreUtil =
        nombreTienda && nombreTienda.toLowerCase() !== "medusa store" ? nombreTienda : "";

    return {
        config,
        establecimiento: config.nombre || nombreUtil || "Farmacia",
    };
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    try {
        const { orderId } = req.params;
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

        /**
         * Ticket de muestra para probar la impresora.
         *
         * Lo arma ESTE mismo código, no el punto de venta. Antes la muestra se
         * componía en el dispositivo y tomaba el nombre del canal de venta en
         * lugar del configurado: quien configuraba el nombre del negocio y
         * después imprimía una prueba veía otro nombre y concluía, con razón,
         * que el ajuste no servía.
         *
         * Con la muestra saliendo de aquí, lo que se ve al probar es
         * exactamente lo que va a salir en una venta real.
         */
        if (orderId === "muestra") {
            const { config, establecimiento } = await leerDatosDelNegocio(req);

            let moneda = "MXN";
            try {
                const regionService: any = req.scope.resolve(Modules.REGION);
                const regiones = await regionService.listRegions({});
                moneda = String(regiones?.[0]?.currency_code ?? "mxn").toUpperCase();
            } catch {
                // Sin región configurada; se usa el valor por omisión.
            }

            return res.json({
                recibo: {
                    folio: "PRUEBA",
                    fecha: new Date().toISOString(),
                    establecimiento,
                    direccion: config.direccion || null,
                    telefono: config.telefono || null,
                    rfc: config.rfc || null,
                    pie: config.pie || null,
                    cajero: null,
                    cliente: null,
                    lineas: [
                        {
                            descripcion: "TICKET DE PRUEBA",
                            controlado: false,
                            cantidad: 1,
                            precio_unitario: 0,
                            importe: 0,
                        },
                    ],
                    moneda,
                    subtotal: 0,
                    descuentos: 0,
                    impuestos: 0,
                    total: 0,
                    metodo_pago: null,
                    leyendas: [
                        "Este ticket es solo una prueba de impresion. No corresponde a ninguna venta.",
                        "Si lo estas leyendo en papel, la impresora esta bien configurada.",
                    ],
                },
            });
        }

        const { data: ordenes } = await query.graph({
            entity: "order",
            fields: [
                "id",
                "display_id",
                "created_at",
                "currency_code",
                "email",
                "subtotal",
                "tax_total",
                "discount_total",
                "total",
                "customer.first_name",
                "customer.last_name",
                "items.id",
                "items.title",
                "items.product_title",
                "items.quantity",
                "items.unit_price",
                "items.total",
                "items.product.metadata",
            ],
            filters: { id: orderId },
        });

        const orden: any = ordenes?.[0];

        if (!orden) {
            return res.status(404).json({ message: "No se encontró la venta." });
        }

        // ── Quién cobró ───────────────────────────────────────────────────────
        // El movimiento de caja guarda el order_id, así que desde ahí se llega a
        // la sesión y a su cajero. Es la identidad REAL: desde el arreglo de la
        // apertura de caja, `cashier_name` sale de la sesión del usuario y no de
        // un campo que alguien haya tecleado.
        let cajero: string | null = null;
        let metodoPago: string | null = null;

        try {
            const { data: movimientos } = await query.graph({
                entity: "cash_movement",
                fields: ["id", "session_id", "payment_method", "type"],
                filters: { order_id: orderId },
            });

            const venta = (movimientos ?? []).find((m: any) => m.type === "sale") ?? movimientos?.[0];

            if (venta) {
                metodoPago = venta.payment_method ?? null;
                const { data: sesiones } = await query.graph({
                    entity: "cash_session",
                    fields: ["id", "cashier_name"],
                    filters: { id: venta.session_id },
                });
                cajero = sesiones?.[0]?.cashier_name ?? null;
            }
        } catch {
            // Una venta puede existir sin movimiento de caja asociado (por
            // ejemplo si se registró con la caja cerrada). El recibo sale igual,
            // sin el nombre del cajero, en lugar de fallar entero.
        }

        // ── Datos del establecimiento ─────────────────────────────────────────
        // Salen de la configuración del ticket (Ajustes → Ticket en el panel).
        const { config, establecimiento } = await leerDatosDelNegocio(req);

        // ── Líneas ────────────────────────────────────────────────────────────
        let controladosOcultos = 0;

        const lineas = (orden.items ?? []).map((it: any) => {
            const controlado = esControlado(it.product?.metadata);
            const nombreReal = it.product_title || it.title || "Producto";

            if (controlado && OCULTAR_CONTROLADOS) {
                controladosOcultos++;
            }

            return {
                descripcion: controlado && OCULTAR_CONTROLADOS ? ETIQUETA_CONTROLADO : nombreReal,
                controlado,
                cantidad: Number(it.quantity ?? 0),
                precio_unitario: Number(it.unit_price ?? 0),
                importe: Number(it.total ?? 0),
            };
        });

        const nombreCliente =
            [orden.customer?.first_name, orden.customer?.last_name].filter(Boolean).join(" ") || null;

        const leyendas = [
            "Comprobante de venta. No es un comprobante fiscal (CFDI).",
        ];

        if (controladosOcultos > 0) {
            // Que el cliente sepa que la línea corresponde a algo concreto y no
            // a un cargo sin explicar.
            leyendas.push(
                "Por privacidad, los medicamentos controlados se muestran de forma genérica. El detalle está en su comprobante de dispensación."
            );
        }

        res.json({
            recibo: {
                folio: orden.display_id ?? null,
                fecha: orden.created_at,
                establecimiento,
                direccion: config.direccion || null,
                telefono: config.telefono || null,
                rfc: config.rfc || null,
                pie: config.pie || null,
                cajero,
                cliente: nombreCliente,
                lineas,
                moneda: String(orden.currency_code ?? "mxn").toUpperCase(),
                subtotal: Number(orden.subtotal ?? 0),
                descuentos: Number(orden.discount_total ?? 0),
                impuestos: Number(orden.tax_total ?? 0),
                total: Number(orden.total ?? 0),
                metodo_pago: metodoPago,
                leyendas,
            },
        });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
}
