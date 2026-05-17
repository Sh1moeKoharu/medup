import { Container, Heading, Text, Table, Badge } from "@medusajs/ui";
import { useEffect, useState } from "react";

export default function InventoryBatchesPage() {
    const [batches, setBatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Obtenemos los lotes desde nuestro nuevo endpoint API
        fetch("/admin/medical-batches")
            .then(res => res.json())
            .then(data => {
                if (data.batches) {
                    // Ordenamos por caducidad (el mas cercano primero)
                    const sorted = data.batches.sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
                    setBatches(sorted);
                }
            })
            .catch(err => console.error("Error fetching batches:", err))
            .finally(() => setLoading(false));
    }, []);

    return (
        <Container className="p-8">
            <Heading level="h1" className="mb-4 text-ui-fg-base">
                📋 Lotes y Caducidades
            </Heading>
            <Text className="text-ui-fg-subtle mb-8">
                Aquí puedes ver todos los lotes de inventario (Batches) dados de alta, junto a sus fechas de caducidad. El sistema FEFO descuenta automáticamente primero a los que aparecen arriba en esta lista (más próximos a caducar).
            </Text>

            {loading ? (
                <Text>Cargando datos de lotes...</Text>
            ) : batches.length === 0 ? (
                <Text>No hay lotes registrados todavía. Comienza a darlos de alta desde los productos.</Text>
            ) : (
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Lote</Table.HeaderCell>
                            <Table.HeaderCell>Variante ID</Table.HeaderCell>
                            <Table.HeaderCell>Cantidad (Stock Físico)</Table.HeaderCell>
                            <Table.HeaderCell>Caducidad</Table.HeaderCell>
                            <Table.HeaderCell>Estado</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {batches.map(batch => {
                            const expDate = new Date(batch.expiration_date);
                            const now = new Date();
                            const isExpired = expDate < now;
                            const isClose = (expDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;

                            return (
                                <Table.Row key={batch.id}>
                                    <Table.Cell className="font-semibold text-ui-fg-base">
                                        {batch.batch_number}
                                    </Table.Cell>
                                    <Table.Cell className="text-ui-fg-muted">
                                        {batch.product_variant?.title || batch.variant_id}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={batch.quantity <= 0 ? "red" : "green"}>
                                            {batch.quantity}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {expDate.toLocaleDateString()}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {isExpired ? (
                                            <Badge color="red">Caducado</Badge>
                                        ) : isClose ? (
                                            <Badge color="orange">Próximo</Badge>
                                        ) : (
                                            <Badge color="green">Vigente</Badge>
                                        )}
                                    </Table.Cell>
                                </Table.Row>
                            );
                        })}
                    </Table.Body>
                </Table>
            )}
        </Container>
    );
}

// Configuración para inyectar en la sidebar del admin
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";

export const config = defineRouteConfig({
    label: "Lotes FEFO",
    icon: DocumentText,
});
