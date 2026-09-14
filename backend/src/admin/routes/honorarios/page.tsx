import { defineRouteConfig } from "@medusajs/admin-sdk";
import { CurrencyDollar } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES, normalizeRole } from "../../../lib/roles";
import { aUsuario } from "../../../lib/usuarios";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Honorarios: comisión de cada médico y lo que se le paga por periodo.
 *
 * La comisión la fija Administración; el reporte cuenta sólo lo que Caja ya
 * cobró de las órdenes surtidas (ver backend/src/lib/honorarios.ts). Las
 * órdenes a mostrador no entran: se cobran como venta.
 */

const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n) || 0);

const HonorariosPage = () => {
    const [medicos, setMedicos] = useState<any[]>([]);
    const [comisiones, setComisiones] = useState<Record<string, any>>({});
    const [porcentaje, setPorcentaje] = useState<Record<string, string>>({});
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const [reporte, setReporte] = useState<any>(null);
    const [ingresos, setIngresos] = useState<any[]>([]);
    const [grupo, setGrupo] = useState("month");
    const [cargando, setCargando] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const [denegado, setDenegado] = useState(false);

    const cargarMedicos = async () => {
        const res = await fetch("/admin/staff", { credentials: "include" });
        if (esDenegado(res)) { setDenegado(true); return; }
        const data = await res.json();
        setMedicos((data.users ?? []).filter((u: any) => normalizeRole(u.metadata?.role) === ROLES.DOCTOR));
        const rc = await fetch("/admin/doctor-commissions", { credentials: "include" });
        const dc = await rc.json();
        const mapa: Record<string, any> = {};
        const pct: Record<string, string> = {};
        for (const c of dc.doctor_commissions ?? []) {
            mapa[c.doctor_id] = c;
            pct[c.doctor_id] = String(c.percent);
        }
        setComisiones(mapa);
        setPorcentaje(pct);
    };

    const cargarReporte = async () => {
        setCargando(true);
        try {
            const q = new URLSearchParams();
            if (desde) q.set("from", desde);
            if (hasta) q.set("to", `${hasta}T23:59:59`);
            const res = await fetch(`/admin/reports/doctor-payments?${q.toString()}`, { credentials: "include" });
            setReporte(await res.json());
            q.set("group", grupo);
            const ri = await fetch(`/admin/reports/revenue?${q.toString()}`, { credentials: "include" });
            setIngresos((await ri.json()).rows ?? []);
        } catch (e) {
            console.error(e);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarMedicos().catch((e) => console.error(e));
    }, []);

    useEffect(() => {
        cargarReporte();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desde, hasta, grupo]);

    const guardar = async (doctorId: string) => {
        setMensaje("");
        const res = await fetch("/admin/doctor-commissions", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doctor_id: doctorId, percent: Number(porcentaje[doctorId] ?? 0) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            setMensaje(data.error ?? data.message ?? "No se pudo guardar la comisión.");
            return;
        }
        setMensaje(`Comisión guardada: ${data.doctor_commission?.doctor_name} · ${data.doctor_commission?.percent}%`);
        await cargarMedicos();
        await cargarReporte();
    };

    if (denegado) return <SinAcceso recurso="los honorarios" />;

    return (
        <Container className="p-8">
            <div className="mb-6">
                <Heading level="h1">Honorarios</Heading>
                <Text className="text-ui-fg-subtle mt-1">
                    Comisión de cada médico sobre lo cobrado de sus órdenes de consulta, y el reporte de pagos por periodo y por turno.
                </Text>
            </div>

            <Heading level="h2" className="mb-3">Comisiones</Heading>
            <div style={{ overflowX: "auto" }}>
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Médico</Table.HeaderCell>
                            <Table.HeaderCell>Usuario</Table.HeaderCell>
                            <Table.HeaderCell>Comisión (%)</Table.HeaderCell>
                            <Table.HeaderCell></Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {medicos.map((m) => (
                            <Table.Row key={m.id}>
                                <Table.Cell>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}</Table.Cell>
                                <Table.Cell>{aUsuario(m.email)}</Table.Cell>
                                <Table.Cell>
                                    <Input type="number" min="0" max="100" step="0.5" style={{ width: 110 }} value={porcentaje[m.id] ?? ""}
                                        onChange={(e) => setPorcentaje({ ...porcentaje, [m.id]: e.target.value })} placeholder="0" />
                                </Table.Cell>
                                <Table.Cell>
                                    <Button size="small" variant="secondary" onClick={() => guardar(m.id)}>
                                        {comisiones[m.id] ? "Guardar" : "Fijar"}
                                    </Button>
                                </Table.Cell>
                            </Table.Row>
                        ))}
                        {medicos.length === 0 && (
                            <Table.Row><Table.Cell {...({ colSpan: 4 } as any)}><Text className="text-ui-fg-muted">No hay cuentas con rol de Médico.</Text></Table.Cell></Table.Row>
                        )}
                    </Table.Body>
                </Table>
            </div>
            {mensaje && <Text className="mt-2 text-sm">{mensaje}</Text>}

            <div className="flex flex-wrap gap-3 mt-8 mb-3 items-end">
                <Heading level="h2" style={{ marginRight: 12 }}>Pagos</Heading>
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Desde</Text>
                    <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Hasta</Text>
                    <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </div>
                <Button variant="secondary" onClick={cargarReporte} isLoading={cargando}>Actualizar</Button>
            </div>

            <div style={{ overflowX: "auto" }}>
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Médico</Table.HeaderCell>
                            <Table.HeaderCell>Turno</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Órdenes</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Cobrado</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">%</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Comisión</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {(reporte?.doctors ?? []).flatMap((m: any) => [
                            <Table.Row key={m.doctor_id}>
                                <Table.Cell><Text weight="plus">{m.doctor_name ?? m.doctor_id}</Text></Table.Cell>
                                <Table.Cell><Badge color="grey">total</Badge></Table.Cell>
                                <Table.Cell className="text-right">{m.ordenes}</Table.Cell>
                                <Table.Cell className="text-right">{formatCurrency(m.cobrado)}</Table.Cell>
                                <Table.Cell className="text-right">{m.percent}%</Table.Cell>
                                <Table.Cell className="text-right"><Text weight="plus">{formatCurrency(m.comision)}</Text></Table.Cell>
                            </Table.Row>,
                            ...m.turnos.map((t: any) => (
                                <Table.Row key={`${m.doctor_id}-${t.turno_id ?? "sin"}`}>
                                    <Table.Cell></Table.Cell>
                                    <Table.Cell className="text-xs text-ui-fg-subtle">
                                        {t.opened_at ? `${new Date(t.opened_at).toLocaleString()} → ${t.closed_at ? new Date(t.closed_at).toLocaleString() : "abierto"}` : "fuera de turno"}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">{t.ordenes}</Table.Cell>
                                    <Table.Cell className="text-right">{formatCurrency(t.cobrado)}</Table.Cell>
                                    <Table.Cell></Table.Cell>
                                    <Table.Cell className="text-right">{formatCurrency(t.comision)}</Table.Cell>
                                </Table.Row>
                            )),
                        ])}
                        {reporte && (reporte.doctors ?? []).length === 0 && (
                            <Table.Row><Table.Cell {...({ colSpan: 6 } as any)}><Text className="text-ui-fg-muted">Nada cobrado de órdenes de consulta en el periodo.</Text></Table.Cell></Table.Row>
                        )}
                    </Table.Body>
                </Table>
            </div>
            {reporte && (
                <Text className="mt-2 text-sm text-ui-fg-subtle">
                    Total cobrado {formatCurrency(reporte.total_cobrado)} · total comisiones {formatCurrency(reporte.total_comision)}
                </Text>
            )}

            <div className="flex flex-wrap gap-3 mt-8 mb-3 items-end">
                <Heading level="h2" style={{ marginRight: 12 }}>Ingresos</Heading>
                <div style={{ width: 160 }}>
                    <Select value={grupo} onValueChange={setGrupo}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                            <Select.Item value="day">Por día</Select.Item>
                            <Select.Item value="week">Por semana</Select.Item>
                            <Select.Item value="month">Por mes</Select.Item>
                            <Select.Item value="doctor">Por médico</Select.Item>
                            <Select.Item value="shift">Por turno</Select.Item>
                        </Select.Content>
                    </Select>
                </div>
            </div>
            <div style={{ overflowX: "auto" }}>
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Periodo</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">{grupo === "doctor" || grupo === "shift" ? "Órdenes" : "Pedidos"}</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Cobrado</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {ingresos.map((r) => (
                            <Table.Row key={r.clave}>
                                <Table.Cell>{r.etiqueta}</Table.Cell>
                                <Table.Cell className="text-right">{r.pedidos ?? r.ordenes}</Table.Cell>
                                <Table.Cell className="text-right">{formatCurrency(r.cobrado)}</Table.Cell>
                            </Table.Row>
                        ))}
                        {ingresos.length === 0 && (
                            <Table.Row><Table.Cell {...({ colSpan: 3 } as any)}><Text className="text-ui-fg-muted">Sin ingresos en el periodo.</Text></Table.Cell></Table.Row>
                        )}
                    </Table.Body>
                </Table>
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Honorarios",
    icon: CurrencyDollar,
});

export default HonorariosPage;
