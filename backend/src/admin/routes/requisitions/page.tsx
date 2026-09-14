import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ArrowsPointingOut } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES } from "../../../lib/roles";
import { useCurrentRole } from "../../lib/use-current-role";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Requisiciones: lo que Enfermería pide a Farmacia.
 *
 * Farmacia surte desde aquí. Surtir descuenta de sus lotes (caducidad más
 * próxima primero) y la misma cantidad entra al almacén de Enfermería con el
 * mismo lote; si no alcanza para todo, no se mueve nada y se dice qué falta.
 */

type Renglon = {
    id: string;
    variant_id: string;
    product_title: string | null;
    quantity_requested: number;
    quantity_dispatched: number;
};

type Requisicion = {
    id: string;
    status: "pending" | "dispatched" | "received" | "cancelled";
    source_location_name: string | null;
    destination_location_name: string | null;
    requested_by_name: string | null;
    dispatched_by_name: string | null;
    received_by_name: string | null;
    notes: string | null;
    created_at: string;
    items: Renglon[];
};

const ESTADO: Record<Requisicion["status"], { texto: string; color: "orange" | "green" | "blue" | "grey" }> = {
    pending: { texto: "Pendiente", color: "orange" },
    dispatched: { texto: "Surtida", color: "blue" },
    received: { texto: "Recibida", color: "green" },
    cancelled: { texto: "Cancelada", color: "grey" },
};

const RequisitionsPage = () => {
    const { role } = useCurrentRole();
    const puedeSurtir = role === ROLES.PHARMACY || role === ROLES.ADMIN;

    const [filas, setFilas] = useState<Requisicion[]>([]);
    const [estado, setEstado] = useState<string>("pending");
    const [cargando, setCargando] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [procesando, setProcesando] = useState<string | null>(null);

    const cargar = async () => {
        setCargando(true);
        try {
            const q = estado === "todas" ? "" : `?status=${estado}`;
            const res = await fetch(`/admin/requisitions${q}`, { credentials: "include" });
            if (esDenegado(res)) { setDenegado(true); return; }
            const data = await res.json();
            setFilas(data.requisitions ?? []);
        } catch (e) {
            console.error("Error cargando requisiciones", e);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estado]);

    const surtir = async (r: Requisicion) => {
        if (!window.confirm(`¿Surtir todo lo pendiente de la requisición de ${r.requested_by_name ?? "Enfermería"}? Se descontará de Farmacia y entrará a ${r.destination_location_name ?? "Enfermería"}.`)) {
            return;
        }
        setProcesando(r.id);
        try {
            const res = await fetch(`/admin/requisitions/${r.id}/dispatch`, { method: "POST", credentials: "include" });
            const data = await res.json();
            if (res.ok) {
                const lineas = (data.movimientos ?? []).map(
                    (m: any) => `· ${m.cantidad} de ${m.product_title} — lote ${m.batch_number} (quedan ${m.saldo_origen} en Farmacia, ${m.saldo_destino} en destino)`
                );
                alert(["Requisición surtida. El traspaso quedó en el kardex de los dos almacenes.", ...lineas, data.advertencia].filter(Boolean).join("\n"));
                cargar();
            } else {
                const detalle = (data.detalle ?? []).map((d: any) => `· ${d.product_title ?? "?"}: faltan ${d.faltante} de ${d.solicitado}`);
                alert([data.error, data.message, ...detalle].filter(Boolean).join("\n"));
            }
        } catch (e) {
            alert("Error de conexión");
        } finally {
            setProcesando(null);
        }
    };

    if (denegado) return <SinAcceso recurso="las requisiciones" />;

    return (
        <Container className="p-8">
            <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <div>
                    <Heading level="h1">Requisiciones</Heading>
                    <Text className="text-ui-fg-subtle mt-1">
                        Lo que Enfermería pide a Farmacia. Al surtir, la existencia sale de Farmacia por caducidad más próxima y entra a Enfermería con el mismo lote.
                    </Text>
                </div>
                <div className="flex items-center gap-2">
                    <div style={{ width: 180 }}>
                        <Select value={estado} onValueChange={setEstado}>
                            <Select.Trigger><Select.Value /></Select.Trigger>
                            <Select.Content>
                                <Select.Item value="pending">Pendientes</Select.Item>
                                <Select.Item value="dispatched">Surtidas</Select.Item>
                                <Select.Item value="received">Recibidas</Select.Item>
                                <Select.Item value="cancelled">Canceladas</Select.Item>
                                <Select.Item value="todas">Todas</Select.Item>
                            </Select.Content>
                        </Select>
                    </div>
                    <Button variant="secondary" onClick={cargar} isLoading={cargando}>Actualizar</Button>
                </div>
            </div>

            {!cargando && filas.length === 0 && (
                <Text className="text-ui-fg-muted">No hay requisiciones en este estado.</Text>
            )}

            <div className="flex flex-col gap-4">
                {filas.map((r) => {
                    const e = ESTADO[r.status] ?? ESTADO.pending;
                    const pendientes = r.items.reduce((s, i) => s + Math.max(0, i.quantity_requested - i.quantity_dispatched), 0);
                    return (
                        <div key={r.id} className="border border-ui-border-base rounded-lg p-4 bg-ui-bg-base">
                            <div className="flex justify-between items-start gap-4 flex-wrap mb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <Badge color={e.color}>{e.texto}</Badge>
                                        <Text className="text-sm text-ui-fg-subtle">{new Date(r.created_at).toLocaleString()}</Text>
                                    </div>
                                    <Text className="text-sm mt-1">
                                        Pide <b>{r.requested_by_name ?? "Enfermería"}</b> · de {r.source_location_name ?? "Farmacia"} a {r.destination_location_name ?? "Enfermería"}
                                        {r.dispatched_by_name ? ` · surtió ${r.dispatched_by_name}` : ""}
                                        {r.received_by_name ? ` · recibió ${r.received_by_name}` : ""}
                                    </Text>
                                    {r.notes && <Text className="text-xs text-ui-fg-muted mt-1">{r.notes}</Text>}
                                </div>
                                {puedeSurtir && r.status === "pending" && (
                                    <Button variant="primary" size="small" onClick={() => surtir(r)} isLoading={procesando === r.id}>
                                        Surtir {pendientes} pendientes
                                    </Button>
                                )}
                            </div>
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Presentación</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Pedido</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Surtido</Table.HeaderCell>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {r.items.map((i) => (
                                        <Table.Row key={i.id}>
                                            <Table.Cell>{i.product_title ?? i.variant_id}</Table.Cell>
                                            <Table.Cell className="text-right">{i.quantity_requested}</Table.Cell>
                                            <Table.Cell className="text-right">{i.quantity_dispatched}</Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </div>
                    );
                })}
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Requisiciones",
    icon: ArrowsPointingOut,
});

export default RequisitionsPage;
