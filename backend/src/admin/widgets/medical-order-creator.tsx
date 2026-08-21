import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { isMedicalOrderCreatorRole, normalizeRole } from "../../lib/roles";
import { Container, Heading, Text, Button, Input, Label, Select } from "@medusajs/ui";
import { useState, useEffect } from "react";

const MedicalOrderCreator = ({ data: customer }: { data: any }) => {
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isMedicalStaff, setIsMedicalStaff] = useState(false);
    
    // Order State
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState<any[]>([]);
    
    // Search State
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    // Selected Item State (for adding to list)
    const [selectedVariant, setSelectedVariant] = useState<any>(null);
    const [quantity, setQuantity] = useState(1);
    const [instructions, setInstructions] = useState("");

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                    setCurrentUser(data.user);
                    const role = normalizeRole(data.user.metadata?.role);
                    if (isMedicalOrderCreatorRole(role)) {
                        setIsMedicalStaff(true);
                    }
                }
            })
            .catch(err => console.error("Error fetching user", err));
    }, []);

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 3) {
            setSearchResults([]);
            return;
        }
        
        setIsSearching(true);
        try {
            // Buscamos productos en la tienda
            const res = await fetch(`/admin/products?q=${term}&limit=10`);
            const data = await res.json();
            
            // Extraer las variantes (solo mostramos productos con variantes)
            const variants: any[] = [];
            data.products?.forEach((p: any) => {
                p.variants?.forEach((v: any) => {
                    variants.push({
                        ...v,
                        product_title: p.title,
                        product_id: p.id,
                        is_pharmaceutical: p.metadata?.is_pharmaceutical
                    });
                });
            });
            setSearchResults(variants);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddItem = () => {
        if (!selectedVariant) return;
        
        setItems([
            ...items, 
            {
                variant_id: selectedVariant.id,
                product_title: `${selectedVariant.product_title} - ${selectedVariant.title}`,
                quantity: quantity,
                instructions: instructions
            }
        ]);

        // Reset
        setSelectedVariant(null);
        setSearchTerm("");
        setSearchResults([]);
        setQuantity(1);
        setInstructions("");
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleSubmitOrder = async () => {
        if (items.length === 0) {
            alert("Agrega al menos un medicamento a la orden");
            return;
        }

        setIsSubmitting(true);
        setSuccessMsg("");

        try {
            const res = await fetch("/admin/medical-orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // La identidad del prescriptor YA NO se envía: el servidor la
                // toma de la sesión. Mandarla desde el cliente permitía atribuir
                // una receta a otro médico. Ver el comentario en
                // src/api/admin/medical-orders/route.ts.
                body: JSON.stringify({
                    customer_id: customer.id,
                    customer_name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.company_name || "Paciente",
                    notes,
                    items
                })
            });

            if (res.ok) {
                setSuccessMsg("¡Orden generada con éxito y enviada a Farmacia!");
                setItems([]);
                setNotes("");
                setTimeout(() => setSuccessMsg(""), 5000);
            } else {
                const err = await res.json();
                alert(`Error: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isMedicalStaff) return null;

    return (
        <Container className="p-6 mb-4 mt-4 bg-ui-bg-subtle rounded-lg border border-ui-border-strong shadow-sm">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🩺</span>
                    <div>
                        <Heading level="h2" className="text-ui-fg-base text-lg font-bold">
                            Generar Orden Médica / Receta
                        </Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-0.5">
                            Crea una orden interna para este paciente. Se enviará a Farmacia para su surtido.
                        </Text>
                    </div>
                </div>

                {successMsg && (
                    <div className="p-3 bg-ui-tag-green-bg border border-ui-tag-green-border text-ui-tag-green-text rounded-md font-medium text-sm">
                        ✅ {successMsg}
                    </div>
                )}

                <div className="border border-ui-border-base p-4 rounded-md bg-ui-bg-base">
                    <Heading level="h3" className="text-sm font-semibold mb-3">Buscar Medicamento</Heading>
                    
                    <div className="relative">
                        <Input 
                            placeholder="Ej. Paracetamol, Ibuprofeno..." 
                            value={searchTerm} 
                            onChange={(e) => handleSearch(e.target.value)} 
                        />
                        {isSearching && <span className="absolute right-3 top-2 text-xs text-ui-fg-muted">Buscando...</span>}
                    </div>

                    {searchResults.length > 0 && !selectedVariant && (
                        <div className="mt-2 border border-ui-border-base rounded-md max-h-40 overflow-y-auto bg-ui-bg-base shadow-sm">
                            {searchResults.map((v) => (
                                <div 
                                    key={v.id} 
                                    className="p-2 text-sm cursor-pointer hover:bg-ui-bg-subtle border-b border-ui-border-base last:border-0 flex justify-between"
                                    onClick={() => setSelectedVariant(v)}
                                >
                                    <span><b>{v.product_title}</b> ({v.title})</span>
                                    {v.is_pharmaceutical && <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">Clínico</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedVariant && (
                        <div className="mt-4 p-3 bg-ui-bg-subtle border border-ui-border-base rounded-md flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-semibold text-ui-fg-base">
                                    Seleccionado: {selectedVariant.product_title} ({selectedVariant.title})
                                </span>
                                <Button variant="secondary" size="small" onClick={() => setSelectedVariant(null)}>
                                    Cambiar
                                </Button>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-3">
                                <div className="col-span-1">
                                    <Label className="text-xs mb-1 block">Cantidad</Label>
                                    <Input 
                                        type="number" 
                                        min="1" 
                                        value={quantity} 
                                        onChange={(e) => setQuantity(Number(e.target.value))} 
                                    />
                                </div>
                                <div className="col-span-2">
                                    <Label className="text-xs mb-1 block">Instrucciones (Dosis, Frecuencia)</Label>
                                    <Input 
                                        placeholder="Ej. 1 cada 8 horas por 3 días" 
                                        value={instructions} 
                                        onChange={(e) => setInstructions(e.target.value)} 
                                    />
                                </div>
                                <div className="col-span-1 flex items-end">
                                    <Button variant="primary" className="w-full" onClick={handleAddItem}>
                                        Agregar
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {items.length > 0 && (
                    <div className="border border-ui-border-base rounded-md overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-ui-bg-subtle text-ui-fg-muted uppercase text-xs">
                                <tr>
                                    <th className="p-3">Medicamento</th>
                                    <th className="p-3">Cant.</th>
                                    <th className="p-3">Instrucciones</th>
                                    <th className="p-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx} className="border-t border-ui-border-base">
                                        <td className="p-3">{item.product_title}</td>
                                        <td className="p-3">{item.quantity}</td>
                                        <td className="p-3 text-ui-fg-subtle">{item.instructions || "Sin instrucciones"}</td>
                                        <td className="p-3 text-right">
                                            <Button variant="danger" size="small" onClick={() => handleRemoveItem(idx)}>
                                                Quitar
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div>
                    <Label className="text-sm font-medium mb-1 block">Notas Clínicas / Diagnóstico (Opcional)</Label>
                    <textarea 
                        className="w-full border border-ui-border-base rounded-md p-2 text-sm bg-ui-bg-base"
                        rows={3}
                        placeholder="Observaciones generales para la farmacia o expediente..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    ></textarea>
                </div>

                <div className="flex justify-end pt-2 border-t border-ui-border-base">
                    <Button 
                        variant="primary" 
                        size="base" 
                        onClick={handleSubmitOrder}
                        isLoading={isSubmitting}
                        disabled={items.length === 0}
                    >
                        Generar y Enviar a Farmacia
                    </Button>
                </div>
            </div>
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "customer.details.after",
});

export default MedicalOrderCreator;
