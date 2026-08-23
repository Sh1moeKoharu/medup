import { Container, Heading, Text, Badge, Button, Table, Input } from "@medusajs/ui";
import { ROLES } from "../../../lib/roles";
import { useCurrentRole } from "../../lib/use-current-role";
import { roleLabel } from "../../../lib/roles";
import { useState, useEffect } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Receipt } from "@medusajs/icons";

const MedicalOrdersPage = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // Punto de entrada para CREAR una orden.
    // El formulario vive en un widget dentro de la ficha del paciente
    // (customer.details.after). Sin este atajo, un médico tenía que adivinar
    // que debía ir a Clientes, abrir un paciente y bajar hasta el final —
    // fue justo lo que reportó el tester: "no veo dónde generar una receta".
    const { role } = useCurrentRole();
    const puedeEmitir = role === ROLES.DOCTOR || role === ROLES.NURSE || role === ROLES.ADMIN;
    const [buscando, setBuscando] = useState(false);
    const [termino, setTermino] = useState("");
    const [pacientes, setPacientes] = useState<any[]>([]);
    const [buscandoPacientes, setBuscandoPacientes] = useState(false);

    const buscarPacientes = async (q: string) => {
        setTermino(q);
        if (q.trim().length < 2) {
            setPacientes([]);
            return;
        }
        setBuscandoPacientes(true);
        try {
            const res = await fetch(`/admin/customers?q=${encodeURIComponent(q)}&limit=8`, {
                credentials: "include",
            });
            const data = await res.json();
            setPacientes(data.customers || []);
        } catch (e) {
            console.error("Error buscando pacientes", e);
        } finally {
            setBuscandoPacientes(false);
        }
    };

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
                    <Heading level="h1">Bandeja de Farmacia</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Órdenes médicas pendientes por surtir. Al surtir, se apartará el stock de los lotes y la orden pasará a caja.
                    </Text>
                </div>
                <div className="flex items-center gap-2">
                    {puedeEmitir && (
                        <Button variant="primary" onClick={() => setBuscando((v) => !v)}>
                            {buscando ? "Cancelar" : "Nueva orden médica"}
                        </Button>
                    )}
                    <Button variant="secondary" onClick={fetchOrders} isLoading={isLoading}>
                        Actualizar
                    </Button>
                </div>
            </div>

            {buscando && (
                <div className="mb-8 p-4 border border-ui-border-base rounded-lg bg-ui-bg-subtle">
                    <Text className="text-sm font-medium mb-2">
                        ¿Para qué paciente es la orden?
                    </Text>
                    <Text className="text-xs text-ui-fg-muted mb-3">
                        La orden se emite desde el expediente del paciente. Busca y elige
                        uno para ir directo a su ficha.
                    </Text>
                    <Input
                        autoFocus
                        placeholder="Nombre o correo del paciente…"
                        value={termino}
                        onChange={(e) => buscarPacientes(e.target.value)}
                    />
                    {buscandoPacientes && (
                        <Text className="text-xs text-ui-fg-muted mt-2">Buscando…</Text>
                    )}
                    {!buscandoPacientes && termino.trim().length >= 2 && pacientes.length === 0 && (
                        <Text className="text-xs text-ui-fg-muted mt-2">
                            Ningún paciente coincide con "{termino}".
                        </Text>
                    )}
                    {pacientes.length > 0 && (
                        <div className="flex flex-col mt-3 border border-ui-border-base rounded-md overflow-hidden">
                            {pacientes.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => { window.location.href = `/app/customers/${p.id}`; }}
                                    className="text-left px-3 py-2 hover:bg-ui-bg-base border-b border-ui-border-base last:border-0"
                                >
                                    <span className="text-sm font-medium">
                                        {[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}
                                    </span>
                                    <span className="text-xs text-ui-fg-muted ml-2">{p.email}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                                        Emitida por: {order.creator_name} ({roleLabel(order.creator_role)})
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
    icon: Receipt,
});

export default MedicalOrdersPage;
