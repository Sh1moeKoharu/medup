import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Badge, Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";

/**
 * Alertas de caducidad por lote (90 / 60 / 30 días).
 *
 * La versión anterior leía `product.metadata.caducidad` de todos los productos.
 * Ese campo dejó de escribirse cuando la caducidad se movió a la tabla de lotes
 * (`product-pharmacy-card.tsx` ya sólo la guarda ahí), así que el widget
 * llevaba tiempo mostrando la lista vacía sin que nada lo delatara.
 *
 * Ahora consume `/admin/expiring-inventory`, que consulta `medical_batch`.
 */

type Tier = "expired" | "30" | "60" | "90";

type Item = {
    batch_id: string;
    batch_number: string;
    title: string;
    expiration_date: string;
    quantity: number;
    shelf_location: string | null;
    status: string;
    days_left: number;
    tier: Tier;
};

const TIER_STYLE: Record<Tier, { color: "red" | "orange" | "blue" | "grey"; label: string }> = {
    expired: { color: "red", label: "Caducado" },
    "30": { color: "red", label: "≤ 30 días" },
    "60": { color: "orange", label: "31–60 días" },
    "90": { color: "blue", label: "61–90 días" },
};

const ExpirationWidget = () => {
    const [items, setItems] = useState<Item[]>([]);
    const [summary, setSummary] = useState<Record<string, { batches: number; units: number }> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/admin/expiring-inventory?days=90", { credentials: "include" })
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(`El servidor respondió ${res.status}`);
                }
                return res.json();
            })
            .then((data) => {
                setItems(data.items || []);
                setSummary(data.summary || null);
            })
            .catch((e) => {
                // Un fallo se muestra: antes cualquier error se tragaba en la
                // consola y el widget decía "el inventario está sano".
                console.error("Error consultando caducidades", e);
                setError(e.message || "No se pudo consultar el inventario.");
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <Container className="p-4 mb-4 mt-4 bg-ui-bg-base rounded-lg border border-ui-border-base shadow-sm">
            <Heading level="h2" className="text-ui-fg-base mb-2 flex items-center gap-2">
                <span></span>Lotes próximos a caducar (90 días)
            </Heading>

            {loading && <Text>Cargando inventario...</Text>}

            {error && (
                <Text className="text-ui-fg-error text-sm">
                    No se pudieron cargar las caducidades: {error}
                </Text>
            )}

            {!loading && !error && (
                <>
                    {summary && (
                        <div className="flex flex-wrap gap-2 mb-3">
                            {(["expired", "30", "60", "90"] as Tier[]).map((tier) => {
                                const s = summary[tier];
                                if (!s || s.batches === 0) return null;
                                return (
                                    <Badge key={tier} color={TIER_STYLE[tier].color}>
                                        {TIER_STYLE[tier].label}: {s.batches} lote(s) · {s.units} u.
                                    </Badge>
                                );
                            })}
                        </div>
                    )}

                    {items.length === 0 ? (
                        <Text className="text-ui-fg-subtle">
                            Ningún lote con existencia caduca en los próximos 90 días.
                        </Text>
                    ) : (
                        <ul className="flex flex-col gap-2 mt-2">
                            {items.map((item) => (
                                <li
                                    key={item.batch_id}
                                    className="flex flex-wrap items-center gap-2 text-ui-fg-subtle border-b border-ui-border-base pb-2 last:border-0"
                                >
                                    <Badge color={TIER_STYLE[item.tier].color} size="2xsmall">
                                        {item.days_left < 0
                                            ? `hace ${Math.abs(item.days_left)}d`
                                            : `${item.days_left}d`}
                                    </Badge>
                                    <span className="font-semibold text-ui-fg-base">{item.title}</span>
                                    <span className="text-ui-fg-muted text-sm">
                                        Lote {item.batch_number} · {item.quantity} u.
                                        {item.shelf_location ? ` · ${item.shelf_location}` : ""}
                                    </span>
                                    <span className="text-ui-fg-muted text-sm">
                                        {new Date(item.expiration_date).toLocaleDateString()}
                                    </span>
                                    {item.status !== "active" && (
                                        <Badge color="grey" size="2xsmall">
                                            {item.status === "quarantined" ? "En cuarentena" : item.status}
                                        </Badge>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "product.list.before",
});

export default ExpirationWidget;
