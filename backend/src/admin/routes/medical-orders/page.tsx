import { Container, Heading, Text, Badge, Button, Table } from "@medusajs/ui";
import { useState, useEffect } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";

const MedicalOrdersPage = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/admin/medical-orders?status=pending");
            const data = await res.json();
            if (data.medical_orders) {
                // Ordenar más recientes primero
                const sorted = data.medical_orders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setOrders(sorted);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const handleDispense = async (orderId: string) => {
        setIsProcessing(orderId);
        try {
            const res = await fetch(`/admin/medical-orders/${orderId}/dispense`, {
                method: "POST"
            });
            const data = await res.json();
            
            if (res.ok) {
                if (data.warnings && data.warnings.length > 0) {
                    alert(`Orden surtida con advertencias de stock:\n${data.warnings.join("\n")}`);
                } else {
                    alert("¡Orden surtida y stock reservado correctamente!");
                }
                // Refrescar lista
                fetchOrders();
            } else {
                alert(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <Container className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <Heading level="h1">Bandeja de Farmacia 💊</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Órdenes médicas pendientes por surtir. Al surtir, se apartará el stock de los lotes y la orden pasará a caja.
                    </Text>
                </div>
                <Button variant="secondary" onClick={fetchOrders} isLoading={isLoading}>
                    Actualizar
                </Button>
            </div>

            {isLoading && orders.length === 0 ? (
                <Text>Cargando órdenes...</Text>
            ) : orders.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-ui-border-base rounded-lg bg-ui-bg-subtle">
                    <Text className="text-ui-fg-muted">No hay órdenes pendientes en este momento.</Text>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {orders.map((order) => (
                        <div key={order.id} className="border border-ui-border-base rounded-lg overflow-hidden shadow-sm">
                            {/* Cabecera de la orden */}
                            <div className="bg-ui-bg-subtle p-4 border-b border-ui-border-base flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge color="blue">Paciente: {order.customer_name || "Desconocido"}</Badge>
                                        <Text className="text-xs text-ui-fg-muted">
                                            {new Date(order.created_at).toLocaleString()}
                                        </Text>
                                    </div>
                                    <Text className="text-sm font-medium">
                                        👨‍⚕️ Emitida por: {order.creator_name} ({order.creator_role === "doctor" ? "Médico" : "Enfermero"})
                                    </Text>
                                    {order.notes && (
                                        <Text className="text-sm text-ui-fg-subtle mt-2 italic">
                                            Notas: {order.notes}
                                        </Text>
                                    )}
                                </div>
                                <div>
                                    <Button 
                                        variant="primary" 
                                        onClick={() => handleDispense(order.id)}
                                        isLoading={isProcessing === order.id}
                                        disabled={isProcessing !== null}
                                    >
                                        Validar y Surtir (Reservar Stock)
                                    </Button>
                                </div>
                            </div>

                            {/* Detalle de items */}
                            <div className="p-0">
                                <Table>
                                    <Table.Header>
                                        <Table.Row>
                                            <Table.HeaderCell>Medicamento</Table.HeaderCell>
                                            <Table.HeaderCell>Cantidad</Table.HeaderCell>
                                            <Table.HeaderCell>Indicaciones</Table.HeaderCell>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {order.items?.map((item: any) => (
                                            <Table.Row key={item.id}>
                                                <Table.Cell className="font-medium">{item.product_title || item.variant_id}</Table.Cell>
                                                <Table.Cell><b>{item.quantity}</b></Table.Cell>
                                                <Table.Cell className="text-ui-fg-subtle">{item.instructions || "-"}</Table.Cell>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Órdenes Médicas",
    icon: "Plus", // Medusa icons
});

export default MedicalOrdersPage;
