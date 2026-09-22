import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Label, Select, Switch, Text } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { precioConMargen } from "../../../lib/margen";

/**
 * Alta de producto con costo, en un solo paso.
 *
 * ── POR QUÉ UNA PÁGINA PROPIA ───────────────────────────────────────────────
 * El formulario de alta de Medusa pide título, opciones y precio, pero no el
 * costo, la clasificación ni nada de lo que un medicamento necesita; eso vivía
 * en el expediente (product-pharmacy-card), que sólo aparece DESPUÉS de crear
 * el producto. La clínica pidió registrar el producto «no sólo como producto y
 * cualidades, con costo y todos los valores que se requiera». El SDK del panel
 * no deja añadir campos al formulario nativo, así que el alta completa es esta.
 *
 * Crea el producto publicado en el canal de venta, su presentación con SKU,
 * código de barras y precio, el expediente (costo, margen, unidades) y, si se
 * captura, el primer lote con su costo real. Después lleva a la ficha, donde
 * todo se sigue editando.
 */

type Almacen = { id: string; name: string; metadata?: Record<string, unknown> | null };

const CLASIFICACIONES = ["Ninguna", "Analgésico", "Antibiótico", "Controlado", "Psicotrópico", "Material de curación"];

const Campo = ({ id, etiqueta, ayuda, children }: { id?: string; etiqueta: string; ayuda?: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1.5">
        <Label htmlFor={id} className="text-sm font-medium">{etiqueta}</Label>
        {children}
        {ayuda && <Text className="text-xs text-ui-fg-subtle">{ayuda}</Text>}
    </div>
);

const AltaDeProductoPage = () => {
    const navegar = useNavigate();
    const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
    const [canal, setCanal] = useState<string | null>(null);

    // Producto
    const [titulo, setTitulo] = useState("");
    const [nombreGenerico, setNombreGenerico] = useState("");
    const [presentacion, setPresentacion] = useState("");
    const [sku, setSku] = useState("");
    const [codigo, setCodigo] = useState("");
    const [clasificacion, setClasificacion] = useState("Ninguna");
    const [requiereReceta, setRequiereReceta] = useState(false);
    const [proveedor, setProveedor] = useState("");

    // Costo y precio
    const [unidadCompra, setUnidadCompra] = useState("caja");
    const [factor, setFactor] = useState("1");
    const [unidadVenta, setUnidadVenta] = useState("pieza");
    const [costoCompra, setCostoCompra] = useState("");
    const [margen, setMargen] = useState("");
    const [precio, setPrecio] = useState("");

    // Primer lote (opcional)
    const [almacenId, setAlmacenId] = useState("");
    const [lote, setLote] = useState("");
    const [caducidad, setCaducidad] = useState("");
    const [cantidad, setCantidad] = useState("");
    const [estante, setEstante] = useState("");

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/admin/stock-locations?fields=id,name,metadata&limit=50", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => {
                const lista: Almacen[] = d.stock_locations ?? [];
                setAlmacenes(lista);
                const general = lista.find((a) => a.metadata?.altus_area === "pharmacy") ?? lista[0];
                if (general) setAlmacenId(general.id);
            })
            .catch(() => undefined);
        fetch("/admin/sales-channels?limit=1", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setCanal(d.sales_channels?.[0]?.id ?? null))
            .catch(() => undefined);
    }, []);

    const factorNum = Number(factor) || 0;
    const costoVenta = costoCompra !== "" && factorNum > 0 ? Number(costoCompra) / factorNum : null;
    const sugerido = costoVenta !== null ? precioConMargen(costoVenta, margen) : null;
    const precioNum = precio !== "" ? Number(precio) : sugerido;
    const margenReal = useMemo(
        () => (costoVenta && precioNum ? Math.round(((precioNum - costoVenta) / costoVenta) * 1000) / 10 : null),
        [costoVenta, precioNum]
    );
    const conLote = lote.trim() !== "" || caducidad !== "" || cantidad !== "";

    const problema = (): string | null => {
        if (titulo.trim().length < 3) return "Escribe el nombre del producto (al menos 3 caracteres).";
        if (!(factorNum >= 1) || !Number.isInteger(factorNum)) return "Las unidades de venta por unidad de compra deben ser un entero de al menos 1.";
        if (costoCompra === "" || !(Number(costoCompra) >= 0)) return "Escribe el costo por unidad de compra: es la base del inventario valorizado.";
        if (precioNum === null || !(precioNum > 0)) return "Escribe el precio de venta, o un margen para calcularlo.";
        if (conLote) {
            if (!lote.trim() || !caducidad || !(Number(cantidad) > 0)) return "Para el primer lote hacen falta número de lote, caducidad y cantidad comprada (o deja los tres vacíos).";
            if (!almacenId) return "Elige el almacén del primer lote.";
        }
        return null;
    };

    const guardar = async () => {
        const p = problema();
        if (p) {
            setError(p);
            return;
        }
        setError(null);
        setGuardando(true);
        try {
            const res = await fetch("/admin/products", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: titulo.trim(),
                    status: "published",
                    ...(canal ? { sales_channels: [{ id: canal }] } : {}),
                    options: [{ title: "Presentación", values: ["Default"] }],
                    variants: [
                        {
                            title: "Default",
                            options: { Presentación: "Default" },
                            // La existencia real vive en los lotes, no en el inventario de Medusa.
                            manage_inventory: false,
                            ...(sku.trim() ? { sku: sku.trim() } : {}),
                            ...(codigo.trim() ? { barcode: codigo.trim() } : {}),
                            prices: [{ amount: precioNum, currency_code: "mxn" }],
                        },
                    ],
                    metadata: {
                        is_pharmaceutical: true,
                        nombre_generico: nombreGenerico.trim(),
                        nombre_comercial: titulo.trim(),
                        presentacion: presentacion.trim(),
                        clasificacion,
                        requiere_receta: requiereReceta,
                        proveedor: proveedor.trim(),
                        precio_compra: costoCompra,
                        margen_automatico: margen,
                        unidad_compra: unidadCompra.trim(),
                        unidad_venta: unidadVenta.trim(),
                        unidades_por_compra: String(factorNum),
                    },
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.product?.id) {
                setError(data?.message || "No se pudo crear el producto.");
                return;
            }
            const producto = data.product;
            const variante = producto.variants?.[0]?.id;

            if (conLote && variante) {
                const r = await fetch("/admin/medical-batches", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        batch_number: lote.trim(),
                        expiration_date: new Date(caducidad).toISOString(),
                        variant_id: variante,
                        stock_location_id: almacenId,
                        purchase_quantity: Number(cantidad),
                        units_per_purchase: factorNum,
                        purchase_unit: unidadCompra.trim() || undefined,
                        sale_unit: unidadVenta.trim() || undefined,
                        unit_cost: Number(costoCompra),
                        shelf_location: estante.trim() || undefined,
                        // El precio ya se fijó arriba: el alta no debe recalcularlo.
                        apply_margin: false,
                        reason: "Alta de producto: primer lote",
                    }),
                });
                const rl = await r.json().catch(() => ({}));
                if (!r.ok) {
                    alert(`El producto se creó, pero el lote no: ${rl?.message ?? r.status}. Regístralo desde la ficha.`);
                }
            }
            navegar(`/products/${producto.id}`);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Container className="flex flex-col gap-6 p-6">
            <div>
                <Heading level="h1">Alta de producto</Heading>
                <Text className="text-ui-fg-subtle">
                    El producto con su costo, su precio y, si ya llegó, su primer lote. Todo se puede corregir después en la ficha.
                </Text>
            </div>

            <section className="flex flex-col gap-4 border-t border-ui-border-base pt-4">
                <Heading level="h2">Producto</Heading>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Campo id="titulo" etiqueta="Nombre" ayuda="Como se busca en el punto de venta. Ej. Paracetamol 500 mg (caja 20 tabletas)">
                        <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                    </Campo>
                    <Campo id="generico" etiqueta="Nombre genérico">
                        <Input id="generico" placeholder="Ej. Paracetamol" value={nombreGenerico} onChange={(e) => setNombreGenerico(e.target.value)} />
                    </Campo>
                    <Campo id="presentacion" etiqueta="Presentación">
                        <Input id="presentacion" placeholder="Ej. Caja con 20 tabletas" value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
                    </Campo>
                    <Campo id="proveedor" etiqueta="Proveedor o laboratorio">
                        <Input id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                    </Campo>
                    <Campo id="sku" etiqueta="SKU" ayuda="Opcional. Clave interna.">
                        <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} />
                    </Campo>
                    <Campo id="codigo" etiqueta="Código de barras" ayuda="Opcional. Con él, el punto de venta lo encuentra al escanear.">
                        <Input id="codigo" inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                    </Campo>
                    <Campo etiqueta="Clasificación">
                        <Select value={clasificacion} onValueChange={setClasificacion}>
                            <Select.Trigger><Select.Value /></Select.Trigger>
                            <Select.Content>
                                {CLASIFICACIONES.map((c) => (
                                    <Select.Item key={c} value={c}>{c === "Ninguna" ? "Ninguna / otro" : c}</Select.Item>
                                ))}
                            </Select.Content>
                        </Select>
                    </Campo>
                    <div className="flex items-center justify-between rounded-md border border-ui-border-base p-3">
                        <div>
                            <Label className="text-sm font-medium">¿Requiere receta?</Label>
                            <Text className="text-xs text-ui-fg-subtle">Venta exclusiva con prescripción</Text>
                        </div>
                        <Switch checked={requiereReceta} onCheckedChange={setRequiereReceta} />
                    </div>
                </div>
            </section>

            <section className="flex flex-col gap-4 border-t border-ui-border-base pt-4">
                <div>
                    <Heading level="h2">Costo y precio</Heading>
                    <Text className="text-xs text-ui-fg-subtle">Como viene en la factura. El inventario se lleva en unidades de venta.</Text>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Campo id="unidad_compra" etiqueta="Unidad de compra">
                        <Input id="unidad_compra" value={unidadCompra} onChange={(e) => setUnidadCompra(e.target.value)} />
                    </Campo>
                    <Campo id="factor" etiqueta="Unidades de venta por unidad de compra">
                        <Input id="factor" type="number" min="1" step="1" value={factor} onChange={(e) => setFactor(e.target.value)} />
                    </Campo>
                    <Campo id="unidad_venta" etiqueta="Unidad de venta">
                        <Input id="unidad_venta" value={unidadVenta} onChange={(e) => setUnidadVenta(e.target.value)} />
                    </Campo>
                    <Campo id="costo" etiqueta="Costo por unidad de compra" ayuda={costoVenta !== null ? `Costo por ${unidadVenta || "unidad"}: $${costoVenta.toFixed(2)}` : undefined}>
                        <Input id="costo" type="number" min="0" step="0.01" placeholder="0.00" value={costoCompra} onChange={(e) => setCostoCompra(e.target.value)} />
                    </Campo>
                    <Campo id="margen" etiqueta="Margen automático (%)" ayuda="Opcional. Con margen, cada compra con costo actualiza el precio.">
                        <Input id="margen" type="number" min="0" step="0.1" placeholder="Ej. 30" value={margen} onChange={(e) => setMargen(e.target.value)} />
                    </Campo>
                    <Campo
                        id="precio"
                        etiqueta={`Precio de venta por ${unidadVenta || "unidad"}`}
                        ayuda={
                            [sugerido !== null ? `Con el margen: $${sugerido.toFixed(2)}` : null, margenReal !== null ? `Margen real ${margenReal}%` : null]
                                .filter(Boolean)
                                .join(" · ") || undefined
                        }
                    >
                        <Input id="precio" type="number" min="0" step="0.01" placeholder={sugerido !== null ? sugerido.toFixed(2) : "0.00"} value={precio} onChange={(e) => setPrecio(e.target.value)} />
                    </Campo>
                </div>
            </section>

            <section className="flex flex-col gap-4 border-t border-ui-border-base pt-4">
                <div>
                    <Heading level="h2">Primer lote</Heading>
                    <Text className="text-xs text-ui-fg-subtle">Opcional. Si el producto ya llegó, regístralo aquí con su costo; si no, deja estos campos vacíos.</Text>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Campo etiqueta="Almacén">
                        <Select value={almacenId} onValueChange={setAlmacenId}>
                            <Select.Trigger><Select.Value placeholder="Elige el almacén" /></Select.Trigger>
                            <Select.Content>
                                {almacenes.map((a) => (
                                    <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>
                                ))}
                            </Select.Content>
                        </Select>
                    </Campo>
                    <Campo id="lote" etiqueta="Número de lote">
                        <Input id="lote" value={lote} onChange={(e) => setLote(e.target.value)} />
                    </Campo>
                    <Campo id="caducidad" etiqueta="Caducidad">
                        <Input id="caducidad" type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
                    </Campo>
                    <Campo id="cantidad" etiqueta={`Cantidad comprada (${unidadCompra || "unidades de compra"})`} ayuda={Number(cantidad) > 0 && factorNum > 0 ? `Entran ${Number(cantidad) * factorNum} ${unidadVenta || "unidades"}` : undefined}>
                        <Input id="cantidad" type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                    </Campo>
                    <Campo id="estante" etiqueta="Estante">
                        <Input id="estante" placeholder="Ej. B-2" value={estante} onChange={(e) => setEstante(e.target.value)} />
                    </Campo>
                </div>
            </section>

            <div className="flex items-center justify-end gap-3 border-t border-ui-border-base pt-4">
                {error && <Text className="mr-auto text-ui-fg-error">{error}</Text>}
                <Button variant="secondary" onClick={() => navegar("/products")} disabled={guardando}>
                    Cancelar
                </Button>
                <Button onClick={guardar} isLoading={guardando}>
                    {conLote ? "Crear producto y registrar lote" : "Crear producto"}
                </Button>
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Alta de producto",
});

export default AltaDeProductoPage;
