import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Button, Input } from "@medusajs/ui";
import { useState, useEffect } from "react";

const SanitaryDestructionWidget = ({ data: product }: { data: any }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [destructionData, setDestructionData] = useState<{ fecha: string, usuario: string } | null>(null);
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    // Initial load checks
    useEffect(() => {
        if (product?.metadata?.fecha_destruccion) {
            setDestructionData({
                fecha: product.metadata.fecha_destruccion,
                usuario: product.metadata.destruido_por || "Usuario Desconocido"
            });
        }
        
        // Fetch current logged in admin user
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                    setCurrentUser(data.user);
                }
            })
            .catch(err => console.error("Error fetching admin user", err));
    }, [product]);

    // Determine if product is expired
    const isExpired = () => {
        if (!product?.metadata?.caducidad) return false;
        const caducidad = new Date(String(product.metadata.caducidad));
        const now = new Date();
        // Set both to midnight for pure date comparison if desired, but direct time is fine
        return caducidad < now;
    };

    const handleConfirmDestruction = async () => {
        if (!currentUser) {
            alert("No se pudo identificar al usuario actual. Refresca la página.");
            return;
        }

        setIsSaving(true);
        setError("");

        try {
            // Verificar contraseña
            const authRes = await fetch(`/auth/user/emailpass`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: currentUser.email,
                    password: password
                })
            });

            if (!authRes.ok) {
                setError("Contraseña incorrecta. Por favor, inténtalo de nuevo.");
                setIsSaving(false);
                return;
            }

            const nowIso = new Date().toISOString();
            const userEmail = currentUser.email;
            const res = await fetch(`/admin/products/${product?.id}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    metadata: {
                        ...product.metadata,
                        fecha_destruccion: nowIso,
                        destruido_por: userEmail
                    }
                })
            });

            if (res.ok) {
                setDestructionData({ fecha: nowIso, usuario: userEmail });
            } else {
                console.error("Error updating product metadata for destruction", await res.text());
                alert("Ocurrió un error al registrar la destrucción en la base de datos.");
            }
        } catch (error) {
            console.error("Network error during destruction", error);
            alert("Error de conexión al registrar la destrucción.");
        } finally {
            setIsSaving(false);
        }
    };

    // Render conditions
    if (!product?.metadata?.caducidad && !destructionData) {
        // If there is no expiration date set, we don't need to show this widget.
        return null;
    }

    if (destructionData) {
        // Already destroyed UI
        return (
            <Container className="p-6 mb-4 mt-4 bg-ui-bg-subtle rounded-lg border border-ui-border-strong shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                        <Heading level="h2" className="text-ui-fg-base text-lg text-ui-tag-green-text font-bold">
                            Producto Destruido
                        </Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-1">
                            Este lote fue destruido conforme a regulación sanitaria el{" "}
                            <strong>{new Date(destructionData.fecha).toLocaleString()}</strong> por{" "}
                            <strong>{destructionData.usuario}</strong>.
                        </Text>
                    </div>
                </div>
            </Container>
        );
    }

    if (isExpired()) {
        // Needs destruction UI
        return (
            <Container className="p-6 mb-4 mt-4 bg-ui-bg-base rounded-lg border-2 border-ui-tag-red-border shadow-sm">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">☣️</span>
                        <div>
                            <Heading level="h2" className="text-ui-fg-base text-xl text-ui-tag-red-text font-bold">
                                ¡Atención! Producto Caducado
                            </Heading>
                            <Text className="text-ui-fg-subtle text-sm mt-1">
                                Según el expediente, este lote alcanzó su fecha de caducidad el{" "}
                                <strong>{new Date(String(product.metadata.caducidad)).toLocaleDateString()}</strong> y debe ser retirado 
                                de la venta para su destrucción sanitaria.
                            </Text>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-3 border-t border-ui-border-base pt-4">
                        <Text className="text-sm italic text-ui-fg-muted pb-2">
                            Para evitar accidentes, por favor ingresa tu contraseña para confirmar esta acción. Tu usuario ({currentUser?.email || "Cargando..."}) quedará registrado como responsable del retiro.
                        </Text>
                        
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 max-w-[300px]">
                                <Input 
                                    type="password" 
                                    placeholder="Contraseña de administrador"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    disabled={!currentUser || isSaving}
                                />
                                {error && <Text className="text-ui-fg-error text-xs mt-1">{error}</Text>}
                            </div>
                            <Button 
                                variant="danger" 
                                size="base" 
                                onClick={handleConfirmDestruction}
                                isLoading={isSaving}
                                disabled={!currentUser || !password || currentUser?.metadata?.role === "auditor"}
                            >
                                {currentUser?.metadata?.role === "auditor" ? "Solo Lectura" : "Confirmar Destrucción Sanitaria"}
                            </Button>
                        </div>
                    </div>
                </div>
            </Container>
        );
    }

    // Product is not expired, widget is silent/hidden
    return null;
};

// Injection Zone to appear above product details
export const config = defineWidgetConfig({
    zone: "product.details.before",
});

export default SanitaryDestructionWidget;
