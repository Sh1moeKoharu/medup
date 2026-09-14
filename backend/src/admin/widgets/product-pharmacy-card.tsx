import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { ROLES, normalizeRole } from "../../lib/roles";
import { precioConMargen } from "../../lib/margen";
import { Container, Heading, Text, Input, Button, Label, Select, Switch } from "@medusajs/ui";
import { useState, useEffect } from "react";

/**
 * Expediente del medicamento, alta de lotes y mínimos por almacén.
 *
 * ── ALTA DE LOTE ────────────────────────────────────────────────────────────
 * Se captura como viene en la factura: cuántas unidades de compra (cajas), de
 * cuántas unidades de venta (tabletas) cada una, a qué costo, en qué almacén.
 * La existencia queda en unidades de venta, y la vista previa lo dice antes de
 * guardar. Si el producto tiene margen automático, también dice en qué precio
 * quedará la venta: el servidor lo escribe al guardar (ver lib/margen.ts).
 *
 * ── MÍNIMOS Y MÁXIMOS ───────────────────────────────────────────────────────
 * Por almacén, porque el mínimo de Farmacia no es el de Enfermería. Se guardan
 * en /admin/stock-policies y el job diario avisa cuando la existencia queda
 * por debajo.
 */

type Almacen = { id: string; name: string; metadata?: Record<string, unknown> | null };

const ProductPharmacyCard = ({ data: product }: { data: any }) => {
    // El `data` de la ficha de producto NO trae las variantes: el widget viejo
    // hacía lo mismo y por eso "no tenía presentación" al registrar un lote.
    // Se piden aparte.
    const [variantId, setVariantId] = useState<string | undefined>(product?.variants?.[0]?.id);

    useEffect(() => {
        if (product?.variants?.[0]?.id) {
            setVariantId(product.variants[0].id);
            return;
        }
        if (!product?.id) return;
        fetch(`/admin/products/${product.id}?fields=id,*variants`, { credentials: "include" })
            .then((res) => res.json())
            .then((data) => setVariantId(data?.product?.variants?.[0]?.id))
            .catch((err) => console.error("Error fetching variants:", err));
    }, [product]);

    // Alta de lote
    const [lote, setLote] = useState<string>("");
    const [caducidad, setCaducidad] = useState<string>("");
    const [almacenId, setAlmacenId] = useState<string>("");
    const [fechaCompra, setFechaCompra] = useState<string>("");
    const [cantidadComprada, setCantidadComprada] = useState<string>("");
    const [unidadCompra, setUnidadCompra] = useState<string>(product?.metadata?.unidad_compra || "");
    const [factor, setFactor] = useState<string>(product?.metadata?.unidades_por_compra || "1");
    const [unidadVenta, setUnidadVenta] = useState<string>(product?.metadata?.unidad_venta || "");
    const [costoCompra, setCostoCompra] = useState<string>("");

    // Datos de compra que siguen en el expediente
    const [proveedor, setProveedor] = useState<string>(product?.metadata?.proveedor || "");
    const [facturaCompra, setFacturaCompra] = useState<string>(product?.metadata?.factura_compra || "");
    const [quienIngresa, setQuienIngresa] = useState<string>(product?.metadata?.quien_ingresa || "");

    // Identificación clínica
    const [nombreGenerico, setNombreGenerico] = useState<string>(product?.metadata?.nombre_generico || "");
    const [nombreComercial, setNombreComercial] = useState<string>(product?.metadata?.nombre_comercial || "");
    const [presentacion, setPresentacion] = useState<string>(product?.metadata?.presentacion || "");
    const [concentracion, setConcentracion] = useState<string>(product?.metadata?.concentracion || "");
    const [formaFarmaceutica, setFormaFarmaceutica] = useState<string>(product?.metadata?.forma_farmaceutica || "");
    const [fraccionArancelaria, setFraccionArancelaria] = useState<string>(product?.metadata?.fraccion_arancelaria || "");

    const [clasificacion, setClasificacion] = useState<string>(product?.metadata?.clasificacion || "Ninguna");
    const [requiereReceta, setRequiereReceta] = useState<boolean>(product?.metadata?.requiere_receta || false);
    const [recetaRetenida, setRecetaRetenida] = useState<boolean>(product?.metadata?.receta_retenida || false);

    // Costos: precio de compra de referencia y margen
    const [precioCompra, setPrecioCompra] = useState<string>(product?.metadata?.precio_compra || "");
    const [margenAutomatico, setMargenAutomatico] = useState<string>(product?.metadata?.margen_automatico || "");

    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [batches, setBatches] = useState<any[]>([]);
    const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
    const [isAuditor, setIsAuditor] = useState(false);

    // Mínimos y máximos por almacén: { [stock_location_id]: { min, max, id, current } }
    const [politicas, setPoliticas] = useState<Record<string, { id?: string; min: string; max: string; current?: number }>>({});

    const fetchBatches = async () => {
        if (!variantId) return;
        try {
            const res = await fetch(`/admin/medical-batches?variant_id=${encodeURIComponent(variantId)}`, { credentials: "include" });
            const data = await res.json();
            setBatches(data.batches ?? []);
        } catch (e) {
            console.error("Error fetching batches:", e);
        }
    };

    const fetchPoliticas = async () => {
        if (!variantId) return;
        try {
            const res = await fetch(`/admin/stock-policies?variant_id=${encodeURIComponent(variantId)}`, { credentials: "include" });
            const data = await res.json();
            const mapa: Record<string, { id?: string; min: string; max: string; current?: number }> = {};
            for (const p of data.stock_policies ?? []) {
                mapa[p.stock_location_id] = {
                    id: p.id,
                    min: String(p.min_quantity ?? ""),
                    max: p.max_quantity === null || p.max_quantity === undefined ? "" : String(p.max_quantity),
                    current: p.current_quantity,
                };
            }
            setPoliticas(mapa);
        } catch (e) {
            console.error("Error fetching stock policies:", e);
        }
    };

    useEffect(() => {
        fetch("/admin/stock-locations?fields=id,name,metadata&limit=50", { credentials: "include" })
            .then((res) => res.json())
            .then((data) => {
                const lista: Almacen[] = data.stock_locations ?? [];
                setAlmacenes(lista);
                // Por omisión, Farmacia: es donde entra la compra.
                const farmacia = lista.find((a) => a.metadata?.altus_area === "pharmacy") ?? lista[0];
                if (farmacia) setAlmacenId((actual) => actual || farmacia.id);
            })
            .catch((err) => console.error("Error fetching stock locations:", err));
    }, []);

    useEffect(() => {
        fetchBatches();
        fetchPoliticas();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variantId]);

    useEffect(() => {
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (normalizeRole(data?.user?.metadata?.role) === ROLES.AUDITOR) {
                    setIsAuditor(true);
                }
            })
            .catch(err => console.error(err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product]);

    // ── Vista previa del alta ───────────────────────────────────────────────
    const factorNum = Number(factor) || 0;
    const compradaNum = Number(cantidadComprada) || 0;
    const unidadesResultantes = factorNum > 0 && compradaNum > 0 ? compradaNum * factorNum : 0;
    const costoVenta = costoCompra !== "" && factorNum > 0 ? Number(costoCompra) / factorNum : null;
    const precioPrevisto = costoVenta !== null ? precioConMargen(costoVenta, margenAutomatico) : null;
    const nombreAlmacen = almacenes.find((a) => a.id === almacenId)?.name ?? "";

    const handleSave = async () => {
        setIsSaving(true);
        setSuccessMsg("");

        try {
            const res = await fetch(`/admin/products/${product?.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    metadata: {
                        ...product?.metadata,
                        is_pharmaceutical: true,
                        proveedor,
                        factura_compra: facturaCompra,
                        quien_ingresa: quienIngresa,
                        nombre_generico: nombreGenerico,
                        nombre_comercial: nombreComercial,
                        presentacion,
                        concentracion,
                        forma_farmaceutica: formaFarmaceutica,
                        fraccion_arancelaria: fraccionArancelaria,
                        clasificacion,
                        requiere_receta: requiereReceta,
                        receta_retenida: recetaRetenida,
                        precio_compra: precioCompra,
                        margen_automatico: margenAutomatico,
                        // Se recuerdan para la próxima compra del mismo producto.
                        unidad_compra: unidadCompra,
                        unidad_venta: unidadVenta,
                        unidades_por_compra: factor,
                    }
                })
            });

            let batchMsg = "";
            if (lote && caducidad) {
                if (!variantId) {
                    batchMsg = " El lote no se registró: el producto no tiene presentación.";
                } else if (!(compradaNum > 0)) {
                    batchMsg = " El lote no se registró: falta la cantidad comprada.";
                } else {
                    const batchRes = await fetch("/admin/medical-batches", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            batch_number: lote,
                            expiration_date: new Date(caducidad).toISOString(),
                            variant_id: variantId,
                            stock_location_id: almacenId || undefined,
                            purchase_date: fechaCompra ? new Date(fechaCompra).toISOString() : undefined,
                            purchase_quantity: compradaNum,
                            units_per_purchase: factorNum || 1,
                            purchase_unit: unidadCompra || undefined,
                            sale_unit: unidadVenta || undefined,
                            unit_cost: costoCompra !== "" ? Number(costoCompra) : undefined,
                            reason: facturaCompra ? `Compra, factura ${facturaCompra}` : undefined,
                        })
                    });
                    const batchData = await batchRes.json().catch(() => ({}));
                    if (batchRes.ok) {
                        batchMsg = ` Lote ${lote} registrado en ${batchData?.batch?.stock_location_name ?? nombreAlmacen}: ${batchData?.batch?.quantity} unidades.`;
                        if (batchData?.precio) {
                            batchMsg += ` Precio de venta: $${Number(batchData.precio.nuevo).toFixed(2)}.`;
                        }
                        if (batchData?.advertencia) {
                            batchMsg += ` ${batchData.advertencia}`;
                        }
                        setLote("");
                        setCaducidad("");
                        setCantidadComprada("");
                        setCostoCompra("");
                        setFechaCompra("");
                        fetchBatches();
                        fetchPoliticas();
                    } else {
                        batchMsg = ` Error al registrar el lote: ${batchData?.message ?? batchRes.status}`;
                    }
                }
            }

            if (res.ok) {
                setSuccessMsg("Expediente actualizado." + batchMsg);
                setTimeout(() => { setSuccessMsg(""); }, 6000);
            } else {
                setSuccessMsg("Error al guardar en la base de datos." + batchMsg);
            }
        } catch (error) {
            console.error(error);
            setSuccessMsg("Error de conexión.");
        } finally {
            setIsSaving(false);
        }
    };

    const guardarPolitica = async (stockLocationId: string) => {
        if (!variantId) return;
        const p = politicas[stockLocationId] ?? { min: "", max: "" };
        try {
            const res = await fetch("/admin/stock-policies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    variant_id: variantId,
                    stock_location_id: stockLocationId,
                    min_quantity: p.min === "" ? 0 : Number(p.min),
                    max_quantity: p.max === "" ? null : Number(p.max),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSuccessMsg(`Error al guardar el mínimo: ${data?.message ?? res.status}`);
                return;
            }
            setSuccessMsg(`Mínimo guardado para ${data?.stock_policy?.stock_location_name ?? "el almacén"}.`);
            setTimeout(() => { setSuccessMsg(""); }, 4000);
            fetchPoliticas();
        } catch (e) {
            setSuccessMsg("Error de conexión.");
        }
    };

    return (
        <Container className="p-6 mb-4 mt-4 bg-ui-bg-base rounded-lg border border-ui-border-base shadow-sm">
            <div className="flex flex-col gap-6">
                <div>
                    <Heading level="h2" className="text-ui-fg-base text-xl">
                       Expediente del medicamento
                    </Heading>
                    <Text className="text-ui-fg-subtle text-sm mt-1">
                        Registra la información clínica, regulatoria y de costos del producto.
                        <i> (El código de barras se administra en la sección de <b>Variantes</b>. El precio de venta también, salvo que el producto tenga margen automático: entonces lo fija cada compra.)</i>
                    </Text>
                </div>

                {/* Section 1: Identificación clínica */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Identificación clínica</Heading>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="generico" className="text-sm font-medium">Nombre genérico</Label>
                            <Input id="generico" placeholder="Ej. Paracetamol" value={nombreGenerico} onChange={(e) => setNombreGenerico(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="comercial" className="text-sm font-medium">Nombre comercial</Label>
                            <Input id="comercial" placeholder="Ej. Tylenol" value={nombreComercial} onChange={(e) => setNombreComercial(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="presentacion" className="text-sm font-medium">Presentación</Label>
                            <Input id="presentacion" placeholder="Ej. Caja con 20 tabletas" value={presentacion} onChange={(e) => setPresentacion(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="concentracion" className="text-sm font-medium">Concentración</Label>
                            <Input id="concentracion" placeholder="Ej. 500mg" value={concentracion} onChange={(e) => setConcentracion(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="forma" className="text-sm font-medium">Forma farmacéutica</Label>
                            <Input id="forma" placeholder="Ej. Tableta, Jarabe, Cápsula" value={formaFarmaceutica} onChange={(e) => setFormaFarmaceutica(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* Section 2: Regulación */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Regulación</Heading>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium">Clasificación</Label>
                            <Select value={clasificacion} onValueChange={setClasificacion}>
                                <Select.Trigger>
                                    <Select.Value placeholder="Seleccionar..." />
                                </Select.Trigger>
                                <Select.Content>
                                    <Select.Item value="Ninguna">Ninguna / Otro</Select.Item>
                                    <Select.Item value="Analgésico">Analgésico</Select.Item>
                                    <Select.Item value="Antibiótico">Antibiótico</Select.Item>
                                    <Select.Item value="Controlado">Controlado</Select.Item>
                                    <Select.Item value="Psicotrópico">Psicotrópico</Select.Item>
                                </Select.Content>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="arancelaria" className="text-sm font-medium">Fracción arancelaria (Opcional)</Label>
                            <Input id="arancelaria" placeholder="Código aduanal..." value={fraccionArancelaria} onChange={(e) => setFraccionArancelaria(e.target.value)} />
                        </div>

                        <div className="flex items-center justify-between border border-ui-border-base p-3 rounded-md mt-2">
                            <div className="flex flex-col">
                                <Label className="text-sm font-medium">¿Requiere receta?</Label>
                                <Text className="text-xs text-ui-fg-subtle">Venta exclusiva con prescripción</Text>
                            </div>
                            <Switch checked={requiereReceta} onCheckedChange={setRequiereReceta} />
                        </div>
                        <div className="flex items-center justify-between border border-ui-border-base p-3 rounded-md mt-2">
                            <div className="flex flex-col">
                                <Label className="text-sm font-medium">¿Receta retenida?</Label>
                                <Text className="text-xs text-ui-fg-subtle">La farmacia debe conservar la receta</Text>
                            </div>
                            <Switch checked={recetaRetenida} onCheckedChange={setRecetaRetenida} />
                        </div>
                    </div>
                </div>

                {/* Section 3: Costos */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Márgenes y compra</Heading>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="compra" className="text-sm font-medium">Precio de compra de referencia</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-ui-fg-muted">$</span>
                                <Input id="compra" type="number" step="0.01" className="pl-7" placeholder="0.00" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} />
                            </div>
                            <Text className="text-xs text-ui-fg-subtle">Informativo. El costo real es el de cada lote.</Text>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="margen" className="text-sm font-medium">Margen automático (%)</Label>
                            <div className="relative">
                                <Input id="margen" type="number" step="0.1" placeholder="Ej. 30" value={margenAutomatico} onChange={(e) => setMargenAutomatico(e.target.value)} />
                                <span className="absolute right-3 top-2 text-ui-fg-muted">%</span>
                            </div>
                            <Text className="text-xs text-ui-fg-subtle">Con margen, cada compra con costo fija el precio de venta. Vacío: el precio se pone a mano en Variantes.</Text>
                        </div>
                    </div>
                </div>

                {/* Section 4: Alta de lote */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-1">Entrada de lote</Heading>
                    <Text className="text-xs text-ui-fg-subtle mb-4">Como viene en la factura. La existencia se lleva en unidades de venta.</Text>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label className="text-sm font-medium">Almacén</Label>
                            <Select value={almacenId} onValueChange={setAlmacenId}>
                                <Select.Trigger>
                                    <Select.Value placeholder="Elige el almacén" />
                                </Select.Trigger>
                                <Select.Content>
                                    {almacenes.map((a) => (
                                        <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="fecha_compra" className="text-sm font-medium">Fecha de compra</Label>
                            <Input id="fecha_compra" type="date" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="lote" className="text-sm font-medium">Número de lote</Label>
                            <Input id="lote" placeholder="Identificador de lote" value={lote} onChange={(e) => setLote(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="caducidad" className="text-sm font-medium">Fecha de caducidad</Label>
                            <Input id="caducidad" type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="cantidad" className="text-sm font-medium">Cantidad comprada</Label>
                            <Input id="cantidad" type="number" min="1" placeholder="Ej. 3" value={cantidadComprada} onChange={(e) => setCantidadComprada(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="unidad_compra" className="text-sm font-medium">Unidad de compra</Label>
                            <Input id="unidad_compra" placeholder="Ej. caja" value={unidadCompra} onChange={(e) => setUnidadCompra(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="factor" className="text-sm font-medium">Unidades de venta por unidad de compra</Label>
                            <Input id="factor" type="number" min="1" step="1" placeholder="Ej. 20" value={factor} onChange={(e) => setFactor(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="unidad_venta" className="text-sm font-medium">Unidad de venta</Label>
                            <Input id="unidad_venta" placeholder="Ej. tableta" value={unidadVenta} onChange={(e) => setUnidadVenta(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="costo" className="text-sm font-medium">Costo por unidad de compra</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-ui-fg-muted">$</span>
                                <Input id="costo" type="number" step="0.01" className="pl-7" placeholder="0.00" value={costoCompra} onChange={(e) => setCostoCompra(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="factura" className="text-sm font-medium">Factura de compra</Label>
                            <Input id="factura" placeholder="Número de factura" value={facturaCompra} onChange={(e) => setFacturaCompra(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="proveedor" className="text-sm font-medium">Proveedor</Label>
                            <Input id="proveedor" placeholder="Nombre del proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="quien_ingresa" className="text-sm font-medium">Quién ingresa</Label>
                            <Input id="quien_ingresa" placeholder="Nombre del usuario/empleado" value={quienIngresa} onChange={(e) => setQuienIngresa(e.target.value)} />
                        </div>

                        {/* Vista previa: lo que va a pasar al guardar. */}
                        <div className="col-span-2 border border-ui-border-base p-3 rounded-md bg-ui-bg-subtle">
                            {unidadesResultantes > 0 ? (
                                <Text className="text-sm">
                                    Entran <b>{unidadesResultantes} {unidadVenta || "unidades"}</b>
                                    {compradaNum && factorNum > 1 ? ` (${compradaNum} ${unidadCompra || "unidades de compra"} × ${factorNum})` : ""}
                                    {nombreAlmacen ? ` en ${nombreAlmacen}` : ""}.
                                    {costoVenta !== null ? ` Costo por ${unidadVenta || "unidad"}: $${costoVenta.toFixed(2)}.` : ""}
                                    {precioPrevisto !== null
                                        ? ` El precio de venta quedará en $${precioPrevisto.toFixed(2)} (margen ${margenAutomatico}%).`
                                        : costoVenta !== null && margenAutomatico === "" ? " Sin margen: el precio de venta no cambia." : ""}
                                </Text>
                            ) : (
                                <Text className="text-xs text-ui-fg-muted">Escribe lote, caducidad y cantidad comprada para dar de alta una entrada al guardar.</Text>
                            )}
                        </div>

                        {/* Lotes */}
                        <div className="col-span-2 border border-ui-border-base p-4 rounded-md bg-ui-bg-subtle">
                            <Heading level="h3" className="text-sm font-medium mb-3">Lotes de este medicamento</Heading>
                            {batches.length === 0 ? (
                                <Text className="text-xs text-ui-fg-muted">No se han registrado lotes para esta presentación.</Text>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {batches.map((b) => (
                                        <li key={b.id} className="text-sm flex justify-between items-center border-b border-ui-border-base pb-2 gap-3 flex-wrap">
                                            <span><span className="text-ui-fg-muted text-xs">Lote:</span> <b>{b.batch_number}</b></span>
                                            <span><span className="text-ui-fg-muted text-xs">Almacén:</span> <b>{b.stock_location_name ?? "—"}</b></span>
                                            <span><span className="text-ui-fg-muted text-xs">Existencia:</span> <b>{b.quantity}{b.sale_unit ? ` ${b.sale_unit}` : ""}</b></span>
                                            <span><span className="text-ui-fg-muted text-xs">Caduca:</span> <b>{new Date(b.expiration_date).toLocaleDateString()}</b></span>
                                            {b.status !== "active" && <span className="text-xs text-ui-fg-error">{b.status === "quarantined" ? "en cuarentena" : "destruido"}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 5: Mínimos y máximos */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-1">Mínimos y máximos por almacén</Heading>
                    <Text className="text-xs text-ui-fg-subtle mb-4">En unidades de venta. Bajo el mínimo, el sistema avisa cada mañana a Almacén y Administración.</Text>
                    <div className="grid grid-cols-1 gap-3">
                        {almacenes.map((a) => {
                            const p = politicas[a.id] ?? { min: "", max: "" };
                            const bajo = p.current !== undefined && p.min !== "" && p.current < Number(p.min);
                            return (
                                <div key={a.id} className="flex items-end gap-3 flex-wrap border border-ui-border-base p-3 rounded-md">
                                    <div className="flex flex-col gap-1 min-w-[180px]">
                                        <Text className="text-sm font-medium">{a.name}</Text>
                                        <Text className={`text-xs ${bajo ? "text-ui-fg-error" : "text-ui-fg-subtle"}`}>
                                            {p.current !== undefined ? `Existencia: ${p.current}${bajo ? " · bajo mínimo" : ""}` : "Sin mínimo definido"}
                                        </Text>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-xs">Mínimo</Label>
                                        <Input type="number" min="0" step="1" style={{ width: 110 }} value={p.min}
                                            onChange={(e) => setPoliticas({ ...politicas, [a.id]: { ...p, min: e.target.value } })} />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-xs">Máximo</Label>
                                        <Input type="number" min="0" step="1" style={{ width: 110 }} value={p.max}
                                            onChange={(e) => setPoliticas({ ...politicas, [a.id]: { ...p, max: e.target.value } })} />
                                    </div>
                                    <Button variant="secondary" size="small" disabled={isAuditor || !variantId} onClick={() => guardarPolitica(a.id)}>
                                        Guardar
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Submit Toolbar */}
                <div className="flex items-center justify-between border-t border-ui-border-base pt-4 mt-2">
                    {successMsg ? (
                        <Text className={`text-sm font-medium ${successMsg.includes("Error") ? 'text-ui-tag-red-text' : 'text-ui-tag-green-text'}`}>
                            {successMsg}
                        </Text>
                    ) : (
                        <div></div>
                    )}

                    <Button
                        variant="primary"
                        size="base"
                        onClick={handleSave}
                        isLoading={isSaving}
                        disabled={isAuditor || isSaving}
                    >
                        {isAuditor ? "Sólo lectura" : lote && caducidad ? "Guardar y registrar lote" : "Guardar expediente"}
                    </Button>
                </div>
            </div>
        </Container>
    );
};

// Injection Zone
export const config = defineWidgetConfig({
    zone: "product.details.after",
});

export default ProductPharmacyCard;
