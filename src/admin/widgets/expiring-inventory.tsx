import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Heading, Text, Container } from "@medusajs/ui";
import { useEffect, useState } from "react";

// The Admin UI fetches from the core Medusa Admin API to find products.
// We will look for products that have a `caducidad` set in metadata.

const ExpirationWidget = () => {
    const [expiringItems, setExpiringItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch all products (or up to a reasonable limit for inventory)
        fetch("/admin/products?limit=100")
            .then((res) => res.json())
            .then((data) => {
                const products = data.products || [];
                const now = new Date();
                const warningThreshold = new Date();
                warningThreshold.setDate(now.getDate() + 30); // 30 days from now
                
                // Filter products that have an expiration date
                const expiring = products.filter((p: any) => {
                    if (!p.metadata || !p.metadata.caducidad) return false;
                    
                    const expDate = new Date(p.metadata.caducidad);
                    // Check if expiration date is strictly before the warning threshold (and handle past due as well)
                    return expDate <= warningThreshold;
                }).map((p: any) => ({
                    title: p.title,
                    expiration_date: p.metadata.caducidad,
                    lote: p.metadata.lote || "Sin lote"
                }));

                // Sort expiring items so the closest to expiration are at the top
                expiring.sort((a: any, b: any) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
                
                setExpiringItems(expiring);
            })
            .catch((e) => console.error("Error fetching expiring inventory", e))
            .finally(() => setLoading(false));
    }, []);

    return (
        <Container className="p-4 mb-4 mt-4 bg-ui-bg-base rounded-lg border border-ui-border-base shadow-sm">
            <Heading level="h2" className="text-ui-fg-base mb-2 flex items-center gap-2">
                <span>⚠️</span> Inventario Próximo a Caducar (30 días)
            </Heading>
            {loading ? (
                <Text>Cargando inventario...</Text>
            ) : expiringItems.length === 0 ? (
                <Text className="text-ui-fg-subtle">
                    El inventario está sano. Ningún medicamento caduca en los próximos 30 días.
                </Text>
            ) : (
                <ul className="list-disc pl-5 mt-3 flex flex-col gap-2">
                    {expiringItems.map((item, i) => {
                        const isExpired = new Date(item.expiration_date) < new Date();
                        return (
                            <li key={i} className="text-ui-fg-subtle">
                                <span className="font-semibold">{item.title}</span> 
                                <span className="text-ui-fg-muted"> (Lote: {item.lote}) </span>
                                 - {isExpired ? "Caducó:" : "Caduca:"}{" "}
                                <span className={isExpired ? "text-ui-tag-red-text font-bold" : "text-ui-tag-orange-text font-bold"}>
                                    {new Date(item.expiration_date).toLocaleDateString()}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "product.list.before",
});

export default ExpirationWidget;
