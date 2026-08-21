import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Text } from "@medusajs/ui";
import { useCallback, useEffect, useState } from "react";
import { ROLES, normalizeRole } from "../../lib/roles";

/**
 * Destrucción sanitaria — POR LOTE.
 *
 * Qué cambió y por qué:
 *
 *  1. Antes operaba a nivel PRODUCTO, leyendo `product.metadata.caducidad` y
 *     escribiendo `metadata.fecha_destruccion`. Un producto tiene muchos lotes
 *     con caducidades distintas: "destruir el producto" no significa nada. Lo
 *     que se destruye es un lote.
 *  2. Antes escribía en `product.metadata` vía POST /admin/products, o sea que
 *     NO tocaba la existencia real ni dejaba asiento. El inventario seguía
 *     mostrando disponible un lote marcado como destruido.
 *  3. Ahora llama a POST /admin/medical-batches/:id/destroy, que pone la
 *     existencia en 0, marca el lote como `destroyed` y asienta la salida en el
 *     libro mayor junto con quién la autorizó.
 *
 * Sólo aparecen lotes en CUARENTENA: el bloqueo por caducidad lo hace el job
 * diario, y destruir es el paso posterior, que exige decisión humana.
 *
 * La confirmación por contraseña se conserva: es un acto irreversible.
 */

type Batch = {
    id: string;
    batch_number: string;
    expiration_date: string;
    quantity: number;
    shelf_location: string | null;
    status: string;
    quarantined_at: string | null;
};

const SanitaryDestructionWidget = ({ data: product }: { data: any }) => {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [password, setPassword] = useState("");
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState("");
    const [done, setDone] = useState<{ batch_number: string; units: number; by: string }[]>([]);

    const variantKey = (product?.variants || [])
        .map((v: any) => v?.id)
        .filter(Boolean)
        .join(",");

    const loadBatches = useCallback(() => {
        if (!variantKey) {
            setLoading(false);
            return;
        }

        fetch(
            `/admin/medical-batches?variant_id=${encodeURIComponent(variantKey)}&status=quarantined`,
            { credentials: "include" }
        )
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
            .then((data) => setBatches(data.batches || []))
            .catch((e) => console.error("Error consultando lotes en cuarentena", e))
            .finally(() => setLoading(false));
    }, [variantKey]);

    useEffect(() => {
        loadBatches();

        fetch("/admin/users/me", { credentials: "include" })
            .then((res) => res.json())
            .then((data) => setCurrentUser(data.user || null))
            .catch((err) => console.error("Error obteniendo el usuario actual", err));
    }, [loadBatches]);

    const isAuditor = normalizeRole(currentUser?.metadata?.role) === ROLES.AUDITOR;

    const handleDestroy = async (batch: Batch) => {
        if (!currentUser) {
            setError("No se pudo identificar al usuario actual. Refresca la página.");
            return;
        }

        setBusyId(batch.id);
        setError("");

        try {
            // Reconfirmación de contraseña: la destrucción es irreversible.
            const authRes = await fetch("/auth/user/emailpass", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: currentUser.email, password }),
            });

            if (!authRes.ok) {
                setError("Contraseña incorrecta. Inténtalo de nuevo.");
                return;
            }

            const res = await fetch(`/admin/medical-batches/${batch.id}/destroy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    notes: `Destrucción registrada desde el expediente de ${product?.title ?? "producto"}`,
                }),
            });

            const payload = await res.json();

            if (!res.ok) {
                // Se muestra el motivo real que devuelve el servidor en lugar de
                // un mensaje genérico: casi siempre explica exactamente qué pasó.
                setError(payload?.message || `El servidor rechazó la operación (${res.status}).`);
                return;
            }

            setDone((prev) => [
                ...prev,
                {
                    batch_number: payload.batch_number,
                    units: payload.destroyed_quantity,
                    by: payload.authorized_by,
                },
            ]);
            setPassword("");
            loadBatches();
        } catch (e: any) {
            setError(e?.message || "Error de conexión al registrar la destrucción.");
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return null;
    }

    // Sin lotes en cuarentena y sin destrucciones en esta sesión: nada que mostrar.
    if (!batches.length && !done.length) {
        return null;
    }

    return (
        <Container className="p-6 mb-4 mt-4 bg-ui-bg-base rounded-lg border-2 border-ui-tag-red-border shadow-sm">
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-3xl">☣️</span>
                    <div>
                        <Heading level="h2" className="text-ui-fg-base text-xl text-ui-tag-red-text font-bold">
                            Lotes en cuarentena
                        </Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-1">
                            Estos lotes caducaron y fueron bloqueados automáticamente. Siguen
                            físicamente en el almacén hasta que se registre su destrucción sanitaria.
                        </Text>
                    </div>
                </div>

                {done.map((d, i) => (
                    <Text key={i} className="text-ui-tag-green-text text-sm">
                        Lote {d.batch_number}: {d.units} unidad(es) destruidas y asentadas en el
                        kardex. Autorizó {d.by}.
                    </Text>
                ))}

                {batches.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-ui-border-base pt-4">
                        {batches.map((b) => (
                            <div
                                key={b.id}
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border-base pb-3 last:border-0"
                            >
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-ui-fg-base">
                                            Lote {b.batch_number}
                                        </span>
                                        <Badge color="red" size="2xsmall">
                                            {b.quantity} u. por destruir
                                        </Badge>
                                    </div>
                                    <Text className="text-ui-fg-muted text-xs">
                                        Caducó el {new Date(b.expiration_date).toLocaleDateString()}
                                        {b.shelf_location ? ` · Ubicación: ${b.shelf_location}` : ""}
                                        {b.quarantined_at
                                            ? ` · Bloqueado el ${new Date(b.quarantined_at).toLocaleDateString()}`
                                            : ""}
                                    </Text>
                                </div>

                                <Button
                                    variant="danger"
                                    size="small"
                                    onClick={() => handleDestroy(b)}
                                    isLoading={busyId === b.id}
                                    disabled={!currentUser || !password || isAuditor || busyId !== null}
                                >
                                    {isAuditor ? "Solo lectura" : "Confirmar destrucción"}
                                </Button>
                            </div>
                        ))}

                        <div className="flex flex-col gap-2 pt-2">
                            <Text className="text-sm italic text-ui-fg-muted">
                                Ingresa tu contraseña para confirmar. Tu usuario (
                                {currentUser?.email || "cargando..."}) quedará registrado como
                                responsable en el libro mayor.
                            </Text>
                            <div className="max-w-[320px]">
                                <Input
                                    type="password"
                                    placeholder="Contraseña"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        if (error) setError("");
                                    }}
                                    disabled={!currentUser || isAuditor || busyId !== null}
                                />
                                {error && (
                                    <Text className="text-ui-fg-error text-xs mt-1">{error}</Text>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "product.details.before",
});

export default SanitaryDestructionWidget;
