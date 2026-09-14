// Efecto: traduce el vocabulario de tienda de Medusa ("Clientes") al de
// clinica ("Pacientes"). No se usa nada de este modulo; el import ES el efecto.
// Va en dos paginas a proposito, para que siga aplicandose si una desaparece.
import "../../lib/vocabulario-clinico";
import { Container, Heading, Text, Badge, Button, Table, Input } from "@medusajs/ui";
import { ROLES } from "../../../lib/roles";
import { esInvitadoDelPos } from "../../../lib/pos-guest";
import { useCurrentRole } from "../../lib/use-current-role";
import { roleLabel } from "../../../lib/roles";
import { useState, useEffect } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Receipt } from "@medusajs/icons";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

const MedicalOrdersPage = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);
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
            // Fuera el invitado del punto de venta: no es un paciente y una
            // receta a su nombre no tendria a quien entregarsela.
            setPacientes((data.customers || []).filter((c: any) => !esInvitadoDelPos(c)));
        } catch (e) {
            console.error("Error buscando pacientes", e);
        } finally {
            setBuscandoPacientes(false);
        }
    };

    const fetchOrders = async () => {
        setIsLoading(true);
        try {
            // Sólo lo dirigido a Farmacia: lo de consulta lo aplica Enfermería
            // desde el punto de venta.
            const res = await fetch("/admin/medical-orders?status=pending&recipient_area=pharmacy");
            if (esDenegado(res)) { setDenegado(true); return; }
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
                // Surtir DESCUENTA, no aparta. Se dice de qué lote salió cada
                // cosa y cuánto queda: es lo que el farmacéutico puede
                // contrastar contra el anaquel.
                const lineas = (data.lotes || []).map(
                    (l: any) =>
                        `· ${l.cantidad} de ${l.product_title} — lote ${l.batch_number} (quedan ${l.saldo_restante})`
                );
                alert(
                    [
                        "Receta surtida. El stock se descontó de los lotes con caducidad más próxima.",
                        ...lineas,
                    ].join("\n")
                );
                // Refrescar lista
                fetchOrders();
            } else {
                // Cuando no alcanza, el servidor responde 409 SIN tocar nada y
                // dice qué falta y cuánto. Antes se perdía ese detalle y sólo se
                // veía "Error:".
                const detalle = (data.detalle || []).map(
                    (d: any) => `· ${d.product_title ?? d.variant_id}: faltan ${d.faltante} de ${d.solicitado}`
                );
                alert([data.error, data.message, ...detalle].filter(Boolean).join("\n"));
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        } finally {
            setIsProcessing(null);
        }
    };

    if (denegado) return <SinAcceso recurso="las órdenes médicas" />;

    return (
        <Container className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <Heading level="h1">Bandeja de Farmacia</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Órdenes médicas pendientes por surtir. Al surtir se descuenta la existencia, empezando por el lote de caducidad más próxima. Si no alcanza, no se surte nada.
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
                                        Validar y surtir (descuenta existencia)
                                    </Button>
                                </div>
                            </div>

                            {/* Detalle de items */}
                            <div className="p-0">
                                <div style={{ overflowX: "auto", width: "100%" }}>
                                    {/* Scroll horizontal: la tabla es mas ancha que una tableta en vertical y,
                                        sin este contenedor, las columnas de la derecha se recortan sin manera
                                        de llegar a ellas. */}
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
                        </div>
                    ))}
                </div>
            )}
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Órdenes médicas",
    icon: Receipt,
});

export default MedicalOrdersPage;
