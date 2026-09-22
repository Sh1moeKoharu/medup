// Efecto: traduce el vocabulario de tienda de Medusa ("Clientes") al de
// clinica ("Pacientes"). No se usa nada de este modulo; el import ES el efecto.
// Va en dos paginas a proposito, para que siga aplicandose si una desaparece.
import "../../lib/vocabulario-clinico";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Receipt } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { esInvitadoDelPos } from "../../../lib/pos-guest";
import { ROLES, roleLabel } from "../../../lib/roles";
import { BuscadorDeProducto, CuadroDeMotivo, enviar } from "../../lib/motivo";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";
import { useCurrentRole } from "../../lib/use-current-role";

/**
 * Órdenes médicas desde el panel.
 *
 * Por omisión, la bandeja de Farmacia (pendientes de mostrador), que se surte
 * desde aquí. Con los filtros se ve todo: lo de Enfermería, lo aplicado, lo
 * cancelado. Sobre una orden pendiente Administración puede CANCELARLA o
 * AJUSTARLA (cantidades, quitar, añadir) con motivo, igual que Enfermería y
 * Farmacia en el punto de venta; cada ajuste queda en la orden con quién y
 * por qué.
 */

const ESTADO: Record<string, { texto: string; color: "orange" | "green" | "grey" | "blue" }> = {
    pending: { texto: "Pendiente", color: "orange" },
    dispensed: { texto: "Surtida o aplicada", color: "green" },
    cancelled: { texto: "Cancelada", color: "grey" },
};
const AREA: Record<string, string> = { pharmacy: "Farmacia", nursing: "Enfermería" };

type Renglon = { variant_id: string; product_title: string | null; quantity: number; instructions: string | null };

const MedicalOrdersPage = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [estado, setEstado] = useState("pending");
    const [area, setArea] = useState("pharmacy");

    const { role } = useCurrentRole();
    const puedeEmitir = role === ROLES.DOCTOR || role === ROLES.NURSE || role === ROLES.ADMIN;
    const puedeSurtir = role === ROLES.PHARMACY || role === ROLES.ADMIN;
    const puedeCancelar = role === ROLES.DOCTOR || role === ROLES.NURSE || role === ROLES.ADMIN;
    const puedeAjustar = role === ROLES.NURSE || role === ROLES.PHARMACY || role === ROLES.ADMIN;

    const [buscando, setBuscando] = useState(false);
    const [termino, setTermino] = useState("");
    const [pacientes, setPacientes] = useState<any[]>([]);
    const [buscandoPacientes, setBuscandoPacientes] = useState(false);

    // Cancelar o ajustar: una orden a la vez, con su motivo.
    const [cancelando, setCancelando] = useState<string | null>(null);
    const [ajustando, setAjustando] = useState<string | null>(null);
    const [renglones, setRenglones] = useState<Renglon[]>([]);

    const buscarPacientes = async (q: string) => {
        setTermino(q);
        if (q.trim().length < 2) {
            setPacientes([]);
            return;
        }
        setBuscandoPacientes(true);
        try {
            const res = await fetch(`/admin/customers?q=${encodeURIComponent(q)}&limit=8`, { credentials: "include" });
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
            const q = new URLSearchParams();
            if (estado !== "todas") q.set("status", estado);
            if (area !== "todas") q.set("recipient_area", area);
            const res = await fetch(`/admin/medical-orders?${q.toString()}`, { credentials: "include" });
            if (esDenegado(res)) { setDenegado(true); return; }
            const data = await res.json();
            if (data.medical_orders) {
                // Ordenar más recientes primero
                setOrders([...data.medical_orders].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estado, area]);

    const handleDispense = async (orderId: string) => {
        setIsProcessing(orderId);
        const { error, data } = await enviar(`/admin/medical-orders/${orderId}/dispense`, {});
        setIsProcessing(null);
        if (error) return alert(error);
        // Surtir DESCUENTA, no aparta. Se dice de qué lote salió cada cosa y
        // cuánto queda: es lo que el farmacéutico puede contrastar contra el anaquel.
        const lineas = (data.lotes || []).map((l: any) => `· ${l.cantidad} de ${l.product_title} — lote ${l.batch_number} (quedan ${l.saldo_restante})`);
        alert(["Receta surtida. El stock se descontó de los lotes con caducidad más próxima.", ...lineas].join("\n"));
        fetchOrders();
    };

    const cancelar = async (orderId: string, motivo: string) => {
        setIsProcessing(orderId);
        const { error } = await enviar(`/admin/medical-orders/${orderId}/cancel`, { motivo });
        setIsProcessing(null);
        if (error) return alert(error);
        setCancelando(null);
        fetchOrders();
    };

    const empezarAjuste = (order: any) => {
        setAjustando(order.id);
        setRenglones(order.items.map((i: any) => ({ variant_id: i.variant_id, product_title: i.product_title ?? null, quantity: i.quantity, instructions: i.instructions ?? null })));
    };

    const ajustar = async (order: any, motivo: string) => {
        // Sólo lo que cambió: el servidor registra cada cambio con antes y después.
        const antes = new Map<string, number>(order.items.map((i: any) => [i.variant_id, i.quantity]));
        const items = renglones
            .filter((r) => antes.get(r.variant_id) !== r.quantity)
            .map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, product_title: r.product_title ?? undefined, instructions: r.instructions ?? undefined }));
        for (const [variant_id, q] of antes) {
            if (!renglones.some((r) => r.variant_id === variant_id) && q > 0) items.push({ variant_id, quantity: 0, product_title: undefined, instructions: undefined });
        }
        if (!items.length) return alert("No cambiaste nada.");
        setIsProcessing(order.id);
        const { error } = await enviar(`/admin/medical-orders/${order.id}/items`, { items, motivo });
        setIsProcessing(null);
        if (error) return alert(error);
        setAjustando(null);
        fetchOrders();
    };

    if (denegado) return <SinAcceso recurso="las órdenes médicas" />;

    return (
        <Container className="p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Heading level="h1">Órdenes médicas</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Las recetas del médico y de Enfermería. Lo de mostrador se surte desde aquí: se descuenta la existencia empezando por el lote de caducidad más próxima, y si no alcanza no se surte nada.
                    </Text>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div style={{ width: 170 }}>
                        <Select value={estado} onValueChange={setEstado}>
                            <Select.Trigger><Select.Value /></Select.Trigger>
                            <Select.Content>
                                <Select.Item value="pending">Pendientes</Select.Item>
                                <Select.Item value="dispensed">Surtidas o aplicadas</Select.Item>
                                <Select.Item value="cancelled">Canceladas</Select.Item>
                                <Select.Item value="todas">Todas</Select.Item>
                            </Select.Content>
                        </Select>
                    </div>
                    <div style={{ width: 170 }}>
                        <Select value={area} onValueChange={setArea}>
                            <Select.Trigger><Select.Value /></Select.Trigger>
                            <Select.Content>
                                <Select.Item value="pharmacy">Farmacia</Select.Item>
                                <Select.Item value="nursing">Enfermería</Select.Item>
                                <Select.Item value="todas">Los dos destinos</Select.Item>
                            </Select.Content>
                        </Select>
                    </div>
                    {puedeEmitir && (
                        <Button variant="primary" onClick={() => setBuscando((v) => !v)}>
                            {buscando ? "Cancelar" : "Nueva orden médica"}
                        </Button>
                    )}
                    <Button variant="secondary" onClick={fetchOrders} isLoading={isLoading}>Actualizar</Button>
                </div>
            </div>

            {buscando && (
                <div className="mb-8 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
                    <Text className="mb-2 text-sm font-medium">¿Para qué paciente es la orden?</Text>
                    <Text className="mb-3 text-xs text-ui-fg-muted">
                        La orden se emite desde el expediente del paciente. Busca y elige uno para ir directo a su ficha.
                    </Text>
                    <Input autoFocus placeholder="Nombre o teléfono del paciente…" value={termino} onChange={(e) => buscarPacientes(e.target.value)} />
                    {buscandoPacientes && <Text className="mt-2 text-xs text-ui-fg-muted">Buscando…</Text>}
                    {!buscandoPacientes && termino.trim().length >= 2 && pacientes.length === 0 && (
                        <Text className="mt-2 text-xs text-ui-fg-muted">Ningún paciente coincide con "{termino}".</Text>
                    )}
                    {pacientes.length > 0 && (
                        <div className="mt-3 flex flex-col overflow-hidden rounded-md border border-ui-border-base">
                            {pacientes.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => { window.location.href = `/app/customers/${p.id}`; }}
                                    className="border-b border-ui-border-base px-3 py-2 text-left last:border-0 hover:bg-ui-bg-base"
                                >
                                    <span className="text-sm font-medium">{[p.first_name, p.last_name].filter(Boolean).join(" ") || p.email}</span>
                                    <span className="ml-2 text-xs text-ui-fg-muted">{p.phone ?? p.email ?? ""}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {isLoading && orders.length === 0 ? (
                <Text>Cargando órdenes...</Text>
            ) : orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ui-border-base bg-ui-bg-subtle p-12 text-center">
                    <Text className="text-ui-fg-muted">No hay órdenes con estos filtros.</Text>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {orders.map((order) => {
                        const e = ESTADO[order.status] ?? { texto: order.status, color: "grey" as const };
                        const pendiente = order.status === "pending";
                        const enAjuste = ajustando === order.id;
                        return (
                            <div key={order.id} className="overflow-hidden rounded-lg border border-ui-border-base shadow-sm">
                                {/* Cabecera de la orden */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border-base bg-ui-bg-subtle p-4">
                                    <div>
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            <Badge color={e.color}>{e.texto}</Badge>
                                            <Badge color="blue">Paciente: {order.customer_name || "Desconocido"}</Badge>
                                            <Badge color="grey">{AREA[order.recipient_area] ?? order.recipient_area}</Badge>
                                            <Text className="text-xs text-ui-fg-muted">{new Date(order.created_at).toLocaleString()}</Text>
                                        </div>
                                        <Text className="text-sm font-medium">
                                            Emitida por: {order.creator_name} ({roleLabel(order.creator_role)})
                                        </Text>
                                        {order.notes && <Text className="mt-2 text-sm italic text-ui-fg-subtle">Notas: {order.notes}</Text>}
                                    </div>
                                    {pendiente && !enAjuste && cancelando !== order.id && (
                                        <div className="flex flex-wrap gap-2">
                                            {puedeAjustar && <Button variant="secondary" onClick={() => empezarAjuste(order)}>Ajustar</Button>}
                                            {puedeCancelar && <Button variant="danger" onClick={() => setCancelando(order.id)}>Cancelar receta</Button>}
                                            {puedeSurtir && order.recipient_area === "pharmacy" && (
                                                <Button variant="primary" onClick={() => handleDispense(order.id)} isLoading={isProcessing === order.id} disabled={isProcessing !== null}>
                                                    Validar y surtir (descuenta existencia)
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {cancelando === order.id && (
                                    <div className="p-4">
                                        <CuadroDeMotivo
                                            titulo="Cancelar esta receta"
                                            descripcion="La receta queda cancelada con tu nombre y el motivo; el médico lo ve en Mis recetas."
                                            etiqueta="Cancelar receta"
                                            enviando={isProcessing === order.id}
                                            onCancelar={() => setCancelando(null)}
                                            onConfirmar={(m) => cancelar(order.id, m)}
                                        />
                                    </div>
                                )}

                                {enAjuste ? (
                                    <div className="flex flex-col gap-3 p-4">
                                        <Table>
                                            <Table.Header>
                                                <Table.Row>
                                                    <Table.HeaderCell>Medicamento</Table.HeaderCell>
                                                    <Table.HeaderCell>Cantidad</Table.HeaderCell>
                                                    <Table.HeaderCell>Indicaciones</Table.HeaderCell>
                                                    <Table.HeaderCell></Table.HeaderCell>
                                                </Table.Row>
                                            </Table.Header>
                                            <Table.Body>
                                                {renglones.map((r, i) => (
                                                    <Table.Row key={r.variant_id}>
                                                        <Table.Cell className="font-medium">{r.product_title || r.variant_id}</Table.Cell>
                                                        <Table.Cell>
                                                            <div style={{ width: 90 }}>
                                                                <Input type="number" min="0" step="1" value={r.quantity} onChange={(ev) => setRenglones(renglones.map((x, j) => (j === i ? { ...x, quantity: Math.max(0, Number(ev.target.value) || 0) } : x)))} />
                                                            </div>
                                                        </Table.Cell>
                                                        <Table.Cell>
                                                            <Input value={r.instructions ?? ""} placeholder="Cómo y cada cuánto" onChange={(ev) => setRenglones(renglones.map((x, j) => (j === i ? { ...x, instructions: ev.target.value } : x)))} />
                                                        </Table.Cell>
                                                        <Table.Cell>
                                                            <Button size="small" variant="transparent" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>Quitar</Button>
                                                        </Table.Cell>
                                                    </Table.Row>
                                                ))}
                                            </Table.Body>
                                        </Table>
                                        <div style={{ maxWidth: 420 }}>
                                            <Text size="small" weight="plus">Añadir material o medicamento</Text>
                                            <BuscadorDeProducto
                                                onElegir={(p) => {
                                                    if (renglones.some((r) => r.variant_id === p.variant_id)) return;
                                                    setRenglones([...renglones, { variant_id: p.variant_id, product_title: p.title, quantity: 1, instructions: "" }]);
                                                }}
                                            />
                                        </div>
                                        <CuadroDeMotivo
                                            titulo="Guardar el ajuste"
                                            descripcion="Quitar o reducir lo recetado queda registrado con tu nombre y este motivo, a la vista del médico y de Auditoría."
                                            etiqueta="Guardar ajuste"
                                            enviando={isProcessing === order.id}
                                            onCancelar={() => setAjustando(null)}
                                            onConfirmar={(m) => ajustar(order, m)}
                                        />
                                    </div>
                                ) : (
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
                                        {(order.ajustes ?? []).length > 0 && (
                                            <div className="border-t border-ui-border-base bg-ui-bg-subtle px-4 py-3">
                                                <Text size="small" weight="plus">Ajustes</Text>
                                                {order.ajustes.map((a: any) => (
                                                    <Text key={a.id} size="small" className="text-ui-fg-subtle">
                                                        {a.actor_name} ({roleLabel(a.actor_role)}): {a.product_title ?? a.variant_id} {a.quantity_before} → {a.quantity_after}{a.reason ? `. ${a.reason}` : ""}
                                                    </Text>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
