import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { ROLES, normalizeRole } from "../../lib/roles";
import { Container, Heading, Text, Input, Button, Label, Select, Switch } from "@medusajs/ui";
import { useState, useEffect } from "react";

// The standard prop for detail widgets in Medusa V2 is `data`
const ProductPharmacyCard = ({ data: product }: { data: any }) => {
    // Basic data that already existed
    const [lote, setLote] = useState<string>(product?.metadata?.lote || "");
    const [caducidad, setCaducidad] = useState<string>(product?.metadata?.caducidad || "");
    const [proveedor, setProveedor] = useState<string>(product?.metadata?.proveedor || "");
    const [facturaCompra, setFacturaCompra] = useState<string>(product?.metadata?.factura_compra || "");
    const [cantidadRecibida, setCantidadRecibida] = useState<string>(product?.metadata?.cantidad_recibida || "");
    const [quienIngresa, setQuienIngresa] = useState<string>(product?.metadata?.quien_ingresa || "");
    
    // New Comprehensive Medical Fields
    const [nombreGenerico, setNombreGenerico] = useState<string>(product?.metadata?.nombre_generico || "");
    const [nombreComercial, setNombreComercial] = useState<string>(product?.metadata?.nombre_comercial || "");
    const [presentacion, setPresentacion] = useState<string>(product?.metadata?.presentacion || "");
    const [concentracion, setConcentracion] = useState<string>(product?.metadata?.concentracion || "");
    const [formaFarmaceutica, setFormaFarmaceutica] = useState<string>(product?.metadata?.forma_farmaceutica || "");
    const [fraccionArancelaria, setFraccionArancelaria] = useState<string>(product?.metadata?.fraccion_arancelaria || "");
    
    // Selects and Booleans
    const [clasificacion, setClasificacion] = useState<string>(product?.metadata?.clasificacion || "Ninguna");
    const [requiereReceta, setRequiereReceta] = useState<boolean>(product?.metadata?.requiere_receta || false);
    const [recetaRetenida, setRecetaRetenida] = useState<boolean>(product?.metadata?.receta_retenida || false);
    
    // Financial (Purchase price and margin)
    // Note: Sell price (Precio Venta) and Barcode go in Variants natively
    const [precioCompra, setPrecioCompra] = useState<string>(product?.metadata?.precio_compra || "");
    const [margenAutomatico, setMargenAutomatico] = useState<string>(product?.metadata?.margen_automatico || "");

    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [batches, setBatches] = useState<any[]>([]);
    const [isAuditor, setIsAuditor] = useState(false);

    const fetchBatches = async () => {
        try {
            const res = await fetch("/admin/medical-batches");
            const data = await res.json();
            if (data.batches) {
                const variantId = product?.variants?.[0]?.id;
                const productBatches = data.batches.filter((b: any) => b.variant_id === variantId);
                setBatches(productBatches);
            }
        } catch (e) {
            console.error("Error fetching batches:", e);
        }
    };

    useEffect(() => {
        if (product?.variants?.[0]?.id) {
            fetchBatches();
        }
        
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (normalizeRole(data?.user?.metadata?.role) === ROLES.AUDITOR) {
                    setIsAuditor(true);
                }
            })
            .catch(err => console.error(err));
    }, [product]);

    const handleSave = async () => {
        setIsSaving(true);
        setSuccessMsg("");
        
        try {
            const res = await fetch(`/admin/products/${product?.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    metadata: {
                        ...product?.metadata,
                        is_pharmaceutical: true,
                        // lote, caducidad, cantidad_recibida ya no se guardan aquí
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
                        margen_automatico: margenAutomatico
                    }
                })
            });

            let batchCreated = false;
            // Crear el Lote en el nuevo módulo medical_batches si hay datos
            if (lote && caducidad) {
                const variantId = product?.variants?.[0]?.id;
                if (variantId) {
                    const batchRes = await fetch("/admin/medical-batches", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            batch_number: lote,
                            expiration_date: new Date(caducidad).toISOString(),
                            quantity: Number(cantidadRecibida) || 0,
                            variant_id: variantId
                        })
                    });
                    if (batchRes.ok) {
                        batchCreated = true;
                        setLote("");
                        setCaducidad("");
                        setCantidadRecibida("");
                        fetchBatches();
                    }
                }
            }

            if (res.ok) {
                if (batchCreated) {
                    setSuccessMsg("¡Expediente actualizado y Nuevo Lote FEFO inyectado!");
                } else {
                    setSuccessMsg("¡Expediente médico actualizado con éxito!");
                }
                setTimeout(() => { setSuccessMsg(""); }, 4000);
            } else {
                console.error("Error updating product metadata");
                setSuccessMsg("Error al guardar en la base de datos.");
            }
        } catch (error) {
            console.error(error);
            setSuccessMsg("Error de conexión.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Container className="p-6 mb-4 mt-4 bg-ui-bg-base rounded-lg border border-ui-border-base shadow-sm">
            <div className="flex flex-col gap-6">
                <div>
                    <Heading level="h2" className="text-ui-fg-base text-xl">
                       Expediente del Medicamento
                    </Heading>
                    <Text className="text-ui-fg-subtle text-sm mt-1">
                        Registra la información clínica, regulatoria y de costos del producto. 
                        <i>(El Precio de Venta y el Código de Barras se administran en la sección de <b>Variants</b>).</i>
                    </Text>
                </div>
                
                {/* Section 1: Identificación Clínica */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Identificación Clínica</Heading>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="generico" className="text-sm font-medium">Nombre Genérico</Label>
                            <Input id="generico" placeholder="Ej. Paracetamol" value={nombreGenerico} onChange={(e) => setNombreGenerico(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="comercial" className="text-sm font-medium">Nombre Comercial</Label>
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
                            <Label htmlFor="forma" className="text-sm font-medium">Forma Farmacéutica</Label>
                            <Input id="forma" placeholder="Ej. Tableta, Jarabe, Cápsula" value={formaFarmaceutica} onChange={(e) => setFormaFarmaceutica(e.target.value)} />
                        </div>
                    </div>
                </div>

                {/* Section 2: Regulación e Inventario */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Regulación e Inventario</Heading>
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
                            <Label htmlFor="arancelaria" className="text-sm font-medium">Fracción Arancelaria (Opcional)</Label>
                            <Input id="arancelaria" placeholder="Código aduanal..." value={fraccionArancelaria} onChange={(e) => setFraccionArancelaria(e.target.value)} />
                        </div>
                        
                        <div className="flex items-center justify-between border border-ui-border-base p-3 rounded-md mt-2">
                            <div className="flex flex-col">
                                <Label className="text-sm font-medium">¿Requiere Receta?</Label>
                                <Text className="text-xs text-ui-fg-subtle">Venta exclusiva con prescripción</Text>
                            </div>
                            <Switch checked={requiereReceta} onCheckedChange={setRequiereReceta} />
                        </div>
                        <div className="flex items-center justify-between border border-ui-border-base p-3 rounded-md mt-2">
                            <div className="flex flex-col">
                                <Label className="text-sm font-medium">¿Receta Retenida?</Label>
                                <Text className="text-xs text-ui-fg-subtle">La farmacia debe conservar la receta</Text>
                            </div>
                            <Switch checked={recetaRetenida} onCheckedChange={setRecetaRetenida} />
                        </div>

                        {/* Existing Lote/Caducidad */}
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="lote" className="text-sm font-medium">Número de Lote</Label>
                            <Input id="lote" placeholder="Identificador de lote" value={lote} onChange={(e) => setLote(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="caducidad" className="text-sm font-medium">Fecha de Caducidad</Label>
                            <Input id="caducidad" type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
                        </div>
                        
                        {/* New Entry Fields */}
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="proveedor" className="text-sm font-medium">Proveedor</Label>
                            <Input id="proveedor" placeholder="Nombre del proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="factura" className="text-sm font-medium">Factura de Compra</Label>
                            <Input id="factura" placeholder="Número de factura" value={facturaCompra} onChange={(e) => setFacturaCompra(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="cantidad" className="text-sm font-medium">Cantidad Recibida</Label>
                            <Input id="cantidad" type="number" placeholder="Ej. 100" value={cantidadRecibida} onChange={(e) => setCantidadRecibida(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-2 mt-2">
                            <Label htmlFor="quien_ingresa" className="text-sm font-medium">Quien Ingresa</Label>
                            <Input id="quien_ingresa" placeholder="Nombre del usuario/empleado" value={quienIngresa} onChange={(e) => setQuienIngresa(e.target.value)} />
                        </div>
                        
                        {/* Lotes Activos */}
                        <div className="col-span-2 border border-ui-border-base p-4 rounded-md bg-ui-bg-subtle mt-4">
                            <Heading level="h3"className="text-sm font-medium mb-3">Lotes Activos de este Medicamento</Heading>
                            {batches.length === 0 ? (
                                <Text className="text-xs text-ui-fg-muted">No se han registrado lotes para esta variante.</Text>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {batches.map((b) => (
                                        <li key={b.id} className="text-sm flex justify-between items-center border-b border-ui-border-base pb-2">
                                            <span><span className="text-ui-fg-muted text-xs">Lote:</span> <b>{b.batch_number}</b></span>
                                            <span><span className="text-ui-fg-muted text-xs">Stock:</span> <b>{b.quantity}</b></span>
                                            <span><span className="text-ui-fg-muted text-xs">Caduca:</span> <b>{new Date(b.expiration_date).toLocaleDateString()}</b></span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                {/* Section 3: Costos */}
                <div className="border-t border-ui-border-base pt-4">
                    <Heading level="h3" className="text-ui-fg-base text-base mb-4">Márgenes y Compra</Heading>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="compra" className="text-sm font-medium">Precio de Compra (Costo Neto)</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-ui-fg-muted">$</span>
                                <Input id="compra" type="number" step="0.01" className="pl-7" placeholder="0.00" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="margen" className="text-sm font-medium">Margen Automático (%)</Label>
                            <div className="relative">
                                <Input id="margen" type="number" step="0.1" placeholder="Ej. 30" value={margenAutomatico} onChange={(e) => setMargenAutomatico(e.target.value)} />
                                <span className="absolute right-3 top-2 text-ui-fg-muted">%</span>
                            </div>
                        </div>
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
                        {isAuditor ? "Solo Lectura" : "Guardar Expediente"}
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
