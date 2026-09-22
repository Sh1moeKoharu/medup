import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ArrowsPointingOut } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { BuscadorDeProducto, CuadroDeMotivo, enviar } from "../../lib/motivo";
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
    const puedeSurtir = role === ROLES.WAREHOUSE || role === ROLES.ADMIN;
    // Pedir, cancelar y confirmar la recepción es de Enfermería; Administración
    // lo hace por ella desde aquí (un pedido urgente, una requisición que ya no procede).
    const puedePedir = role === ROLES.NURSE || role === ROLES.ADMIN;
    const [creando, setCreando] = useState(false);
    const [renglones, setRenglones] = useState<{ variant_id: string; title: string; quantity: number }[]>([]);
    const [notas, setNotas] = useState("");
    const [cancelando, setCancelando] = useState<string | null>(null);

    const crear = async () => {
        if (!renglones.length) return alert("Añade al menos una presentación.");
        setProcesando("nueva");
        const { error } = await enviar("/admin/requisitions", {
            items: renglones.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, product_title: r.title })),
            notes: notas.trim() || undefined,
        });
        setProcesando(null);
        if (error) return alert(error);
        setCreando(false);
        setRenglones([]);
        setNotas("");
        setEstado("pending");
        cargar();
    };
    const cancelar = async (id: string, motivo: string) => {
        setProcesando(id);
        const { error } = await enviar(`/admin/requisitions/${id}/cancel`, { motivo });
        setProcesando(null);
        if (error) return alert(error);
        setCancelando(null);
        cargar();
    };
    const recibir = async (r: Requisicion) => {
        if (!window.confirm(`¿Confirmar que lo surtido llegó a ${r.destination_location_name ?? "Enfermería"}? La existencia entra a ese almacén con el mismo lote.`)) return;
        setProcesando(r.id);
        const { error } = await enviar(`/admin/requisitions/${r.id}/receive`, {});
        setProcesando(null);
        if (error) return alert(error);
        cargar();
    };

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
                    {puedePedir && !creando && <Button onClick={() => setCreando(true)}>Nueva requisición</Button>}
                    <Button variant="secondary" onClick={cargar} isLoading={cargando}>Actualizar</Button>
                </div>
            </div>

            {creando && (
                <div className="mb-6 flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
                    <Heading level="h2">Nueva requisición a Farmacia</Heading>
                    <Text size="small" className="text-ui-fg-subtle">Lo que hace falta en Enfermería. Almacén la surte y Enfermería confirma que llegó.</Text>
                    <div style={{ maxWidth: 420 }}>
                        <BuscadorDeProducto onElegir={(p) => { if (!renglones.some((r) => r.variant_id === p.variant_id)) setRenglones([...renglones, { variant_id: p.variant_id, title: p.title, quantity: 1 }]); }} />
                    </div>
                    {renglones.length > 0 && (
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Presentación</Table.HeaderCell>
                                    <Table.HeaderCell>Unidades</Table.HeaderCell>
                                    <Table.HeaderCell></Table.HeaderCell>
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {renglones.map((r, i) => (
                                    <Table.Row key={r.variant_id}>
                                        <Table.Cell>{r.title}</Table.Cell>
                                        <Table.Cell>
                                            <div style={{ width: 90 }}>
                                                <Input type="number" min="1" step="1" value={r.quantity} onChange={(e) => setRenglones(renglones.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell><Button size="small" variant="transparent" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>Quitar</Button></Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    )}
                    <Input placeholder="Nota para Almacén (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setCreando(false)}>Cancelar</Button>
                        <Button onClick={crear} isLoading={procesando === "nueva"}>Enviar requisición</Button>
                    </div>
                </div>
            )}

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
                                <div className="flex flex-wrap gap-2">
                                    {puedePedir && r.status === "pending" && cancelando !== r.id && (
                                        <Button variant="danger" size="small" onClick={() => setCancelando(r.id)}>Cancelar</Button>
                                    )}
                                    {puedeSurtir && r.status === "pending" && (
                                        <Button variant="primary" size="small" onClick={() => surtir(r)} isLoading={procesando === r.id}>
                                            Surtir {pendientes} pendientes
                                        </Button>
                                    )}
                                    {puedePedir && r.status === "dispatched" && (
                                        <Button variant="primary" size="small" onClick={() => recibir(r)} isLoading={procesando === r.id}>
                                            Confirmar que llegó
                                        </Button>
                                    )}
                                </div>
                            </div>
                            {cancelando === r.id && (
                                <div className="mb-3">
                                    <CuadroDeMotivo
                                        titulo="Cancelar esta requisición"
                                        etiqueta="Cancelar requisición"
                                        enviando={procesando === r.id}
                                        onCancelar={() => setCancelando(null)}
                                        onConfirmar={(m) => cancelar(r.id, m)}
                                    />
                                </div>
                            )}
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
