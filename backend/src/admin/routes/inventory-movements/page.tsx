import { defineRouteConfig } from "@medusajs/admin-sdk";
import { sinVarianteUnica } from "../../lib/titulos";
import { ArrowUturnLeft } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Kardex: el libro mayor de inventario, por almacén.
 *
 * La ruta `/admin/inventory-movements` existía desde el libro mayor y no
 * tenía pantalla: el kardex se consultaba sólo por API. Aquí se filtra por
 * almacén, tipo de movimiento y fechas, y se ve de qué lote salió cada cosa,
 * quién lo hizo y con qué referencia.
 */

const TIPO: Record<string, { texto: string; color: "green" | "red" | "orange" | "blue" | "grey" }> = {
    entry_purchase: { texto: "Compra", color: "green" },
    entry_return: { texto: "Devolución", color: "green" },
    entry_adjustment: { texto: "Ajuste +", color: "green" },
    entry_transfer: { texto: "Traspaso recibido", color: "blue" },
    entry_initial: { texto: "Carga inicial", color: "grey" },
    exit_sale: { texto: "Venta / dispensación", color: "red" },
    exit_adjustment: { texto: "Ajuste −", color: "orange" },
    exit_transfer: { texto: "Traspaso enviado", color: "blue" },
    exit_expiry: { texto: "Destrucción sanitaria", color: "red" },
    exit_damage: { texto: "Baja por daño", color: "orange" },
};

const KardexPage = () => {
    const [almacenes, setAlmacenes] = useState<{ id: string; name: string }[]>([]);
    const [almacen, setAlmacen] = useState("todos");
    const [tipo, setTipo] = useState("todos");
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const [filas, setFilas] = useState<any[]>([]);
    const [resumen, setResumen] = useState<any>(null);
    const [cargando, setCargando] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [pagina, setPagina] = useState(0);
    const POR_PAGINA = 50;

    useEffect(() => {
        fetch("/admin/stock-locations?fields=id,name&limit=50", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setAlmacenes(d.stock_locations ?? []))
            .catch(() => undefined);
    }, []);

    const cargar = async () => {
        setCargando(true);
        try {
            const q = new URLSearchParams();
            if (almacen !== "todos") q.set("stock_location_id", almacen);
            if (tipo !== "todos") q.set("type", tipo);
            if (desde) q.set("from", desde);
            if (hasta) q.set("to", `${hasta}T23:59:59`);
            q.set("limit", String(POR_PAGINA));
            q.set("offset", String(pagina * POR_PAGINA));
            const res = await fetch(`/admin/inventory-movements?${q.toString()}`, { credentials: "include" });
            if (esDenegado(res)) { setDenegado(true); return; }
            const data = await res.json();
            setFilas(data.movements ?? []);
            setResumen(data.summary ?? null);
        } catch (e) {
            console.error("Error cargando el kardex", e);
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [almacen, tipo, desde, hasta, pagina]);

    const nombreAlmacen = (id: string | null) => almacenes.find((a) => a.id === id)?.name ?? (id ? "—" : "sin almacén");

    if (denegado) return <SinAcceso recurso="el kardex" />;

    return (
        <Container className="p-8">
            <div className="mb-6">
                <Heading level="h1">Kardex</Heading>
                <Text className="text-ui-fg-subtle mt-1">
                    Cada entrada y salida de existencia, por lote y por almacén. Sólo se escribe desde las operaciones que mueven inventario; aquí no se edita nada.
                </Text>
            </div>

            <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div style={{ width: 220 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Almacén</Text>
                    <Select value={almacen} onValueChange={(v) => { setPagina(0); setAlmacen(v); }}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                            <Select.Item value="todos">Todos</Select.Item>
                            {almacenes.map((a) => <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>)}
                        </Select.Content>
                    </Select>
                </div>
                <div style={{ width: 220 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Movimiento</Text>
                    <Select value={tipo} onValueChange={(v) => { setPagina(0); setTipo(v); }}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                            <Select.Item value="todos">Todos</Select.Item>
                            {Object.entries(TIPO).map(([k, v]) => <Select.Item key={k} value={k}>{v.texto}</Select.Item>)}
                        </Select.Content>
                    </Select>
                </div>
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Desde</Text>
                    <Input type="date" value={desde} onChange={(e) => { setPagina(0); setDesde(e.target.value); }} />
                </div>
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Hasta</Text>
                    <Input type="date" value={hasta} onChange={(e) => { setPagina(0); setHasta(e.target.value); }} />
                </div>
                <Button variant="secondary" onClick={cargar} isLoading={cargando}>Actualizar</Button>
            </div>

            {resumen && (
                <Text className="text-ui-fg-subtle mb-3" size="small">
                    En esta página: entradas {resumen.total_entries} · salidas {resumen.total_exits} · mermas {resumen.total_shrinkage} · neto {resumen.net}
                </Text>
            )}

            <div style={{ overflowX: "auto", width: "100%" }}>
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>Fecha</Table.HeaderCell>
                            <Table.HeaderCell>Almacén</Table.HeaderCell>
                            <Table.HeaderCell>Presentación</Table.HeaderCell>
                            <Table.HeaderCell>Lote</Table.HeaderCell>
                            <Table.HeaderCell>Movimiento</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Cantidad</Table.HeaderCell>
                            <Table.HeaderCell className="text-right">Saldo</Table.HeaderCell>
                            <Table.HeaderCell>Quién · motivo</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {filas.map((m) => {
                            const t = TIPO[m.type] ?? { texto: m.type, color: "grey" as const };
                            return (
                                <Table.Row key={m.id}>
                                    <Table.Cell className="text-xs text-ui-fg-subtle">{new Date(m.created_at).toLocaleString()}</Table.Cell>
                                    <Table.Cell>{nombreAlmacen(m.stock_location_id)}</Table.Cell>
                                    <Table.Cell>{m.variant_title ? sinVarianteUnica(m.variant_title) : "Presentación retirada del catálogo"}</Table.Cell>
                                    <Table.Cell className="font-mono text-xs">{m.batch_number ?? "—"}</Table.Cell>
                                    <Table.Cell><Badge color={t.color}>{t.texto}</Badge></Table.Cell>
                                    <Table.Cell className="text-right">{m.quantity_delta > 0 ? `+${m.quantity_delta}` : m.quantity_delta}</Table.Cell>
                                    <Table.Cell className="text-right">{m.quantity_after}</Table.Cell>
                                    <Table.Cell className="text-xs text-ui-fg-subtle">
                                        {m.user_email ?? "sistema"}
                                        {m.reason ? ` · ${m.reason}` : ""}
                                        {m.reference_type ? ` · ${m.reference_type}` : ""}
                                    </Table.Cell>
                                </Table.Row>
                            );
                        })}
                        {!cargando && filas.length === 0 && (
                            <Table.Row>
                                <Table.Cell {...({ colSpan: 8 } as any)}>
                                    <Text className="text-ui-fg-muted" style={{ textAlign: "center", padding: 20 }}>Sin movimientos con esos filtros.</Text>
                                </Table.Cell>
                            </Table.Row>
                        )}
                    </Table.Body>
                </Table>
            </div>

            <div className="flex items-center gap-2 mt-4">
                <Button variant="secondary" size="small" disabled={pagina === 0 || cargando} onClick={() => setPagina((p) => Math.max(0, p - 1))}>Anterior</Button>
                <Text size="small" className="text-ui-fg-subtle">Página {pagina + 1}</Text>
                <Button variant="secondary" size="small" disabled={filas.length < POR_PAGINA || cargando} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Kardex",
    icon: ArrowUturnLeft,
});

export default KardexPage;
