import { Badge, Button, Container, Heading, Input, Table, Tabs, Text } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { sinVarianteUnica } from "../../../lib/titulos";
import { descargarDesde, imprimirDesde } from "../../../lib/imprimir";
import { ROLES } from "../../../../lib/roles";
import { enviar } from "../../../lib/motivo";
import { useCurrentRole } from "../../../lib/use-current-role";

/**
 * Un almacén en detalle: sus productos con existencia, costo y valor, sus
 * lotes con caducidad y estante, y los movimientos recientes. Desde aquí se
 * imprime o se descarga su inventario.
 */

type Renglon = {
    variant_id: string;
    title: string;
    units: number;
    batches: number;
    quarantined_units: number;
    average_unit_cost: number | null;
    total_value: number | null;
};

type Politica = { variant_id: string; min_quantity: number; max_quantity: number | null; below_min: boolean };

const dinero = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const ESTADO_LOTE: Record<string, { texto: string; color: "green" | "orange" | "red" | "grey" }> = {
    active: { texto: "Activo", color: "green" },
    quarantined: { texto: "En cuarentena", color: "orange" },
    destroyed: { texto: "Destruido", color: "grey" },
};

const TIPO: Record<string, string> = {
    entry_purchase: "Compra",
    entry_return: "Devolución",
    entry_adjustment: "Ajuste (entrada)",
    entry_transfer: "Traspaso recibido",
    entry_initial: "Carga inicial",
    exit_sale: "Venta o aplicación",
    exit_adjustment: "Ajuste (salida)",
    exit_transfer: "Traspaso enviado",
    exit_expiry: "Caducidad",
    exit_damage: "Daño o robo",
};

const DetalleDeAlmacenPage = () => {
    const { id } = useParams();
    const [nombre, setNombre] = useState("");
    const [renglones, setRenglones] = useState<Renglon[]>([]);
    const [resumen, setResumen] = useState<any>(null);
    const [politicas, setPoliticas] = useState<Map<string, Politica>>(new Map());
    const [lotes, setLotes] = useState<any[]>([]);
    const [movimientos, setMovimientos] = useState<any[]>([]);
    const [busqueda, setBusqueda] = useState("");
    const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
    const [cargando, setCargando] = useState(true);
    // Mínimo y máximo de cada presentación en ESTE almacén (stock-policies).
    const { role } = useCurrentRole();
    const puedeFijar = role === ROLES.ADMIN || role === ROLES.WAREHOUSE;
    const [editando, setEditando] = useState<string | null>(null);
    const [limites, setLimites] = useState({ min: "", max: "" });
    const [guardando, setGuardando] = useState(false);
    const guardarLimites = async (r: Renglon) => {
        setGuardando(true);
        const { error, data } = await enviar("/admin/stock-policies", {
            variant_id: r.variant_id,
            stock_location_id: id,
            min_quantity: Number(limites.min) || 0,
            max_quantity: limites.max === "" ? null : Number(limites.max),
        });
        setGuardando(false);
        if (error) return alert(error);
        const p = data.stock_policy ?? data.policy ?? { min_quantity: Number(limites.min) || 0, max_quantity: limites.max === "" ? null : Number(limites.max) };
        setPoliticas(new Map(politicas).set(r.variant_id, { variant_id: r.variant_id, min_quantity: Number(p.min_quantity) || 0, max_quantity: p.max_quantity ?? null, below_min: r.units < (Number(p.min_quantity) || 0) }));
        setEditando(null);
    };

    useEffect(() => {
        if (!id) return;
        const leer = (ruta: string) => fetch(ruta, { credentials: "include" }).then((r) => (r.ok ? r.json() : {}));
        Promise.all([
            leer(`/admin/stock-locations/${id}?fields=id,name`),
            leer(`/admin/inventory-reports/valuation?stock_location_id=${id}&include_quarantined=true`),
            leer(`/admin/stock-policies?stock_location_id=${id}`),
            leer(`/admin/medical-batches?stock_location_id=${id}`),
            leer(`/admin/inventory-movements?stock_location_id=${id}&limit=50`),
        ])
            .then(([loc, val, pol, lot, mov]: any[]) => {
                setNombre(loc?.stock_location?.name ?? "Almacén");
                setRenglones(val?.items ?? []);
                setResumen(val?.summary ?? null);
                setPoliticas(new Map((pol?.stock_policies ?? []).map((p: Politica) => [p.variant_id, p])));
                setLotes((lot?.batches ?? []).filter((b: any) => Number(b.quantity) > 0 || b.status !== "active"));
                setMovimientos(mov?.movements ?? []);
            })
            .finally(() => setCargando(false));
    }, [id]);

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return renglones
            .filter((r) => !q || r.title.toLowerCase().includes(q))
            .filter((r) => !soloBajoMinimo || politicas.get(r.variant_id)?.below_min)
            .sort((a, b) => a.title.localeCompare(b.title, "es"));
    }, [renglones, busqueda, soloBajoMinimo, politicas]);
    const bajoMinimo = [...politicas.values()].filter((p) => p.below_min).length;

    const imprimir = async () => {
        const e = await imprimirDesde(`/admin/reports/export?tipo=inventario&almacen=${id}&formato=html`);
        if (e) alert(e);
    };
    const descargar = async () => {
        const e = await descargarDesde(`/admin/reports/export?tipo=inventario&almacen=${id}&formato=csv`, "inventario.csv");
        if (e) alert(e);
    };

    return (
        <Container className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Link to="/almacenes" className="text-ui-fg-subtle text-sm hover:underline">← Almacenes</Link>
                    <Heading level="h1">{nombre || "Almacén"}</Heading>
                    {resumen && (
                        <Text className="text-ui-fg-subtle">
                            {renglones.length} presentaciones · {resumen.total_batches} lotes · {resumen.total_units} unidades · valor {dinero(resumen.total_value)}
                        </Text>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={descargar}>Descargar para Excel</Button>
                    <Button onClick={imprimir}>Imprimir inventario</Button>
                </div>
            </div>

            {cargando ? (
                <Text className="text-ui-fg-subtle">Cargando…</Text>
            ) : (
                <Tabs defaultValue="productos">
                    <Tabs.List>
                        <Tabs.Trigger value="productos">Productos ({renglones.length})</Tabs.Trigger>
                        <Tabs.Trigger value="lotes">Lotes ({lotes.length})</Tabs.Trigger>
                        <Tabs.Trigger value="movimientos">Movimientos recientes</Tabs.Trigger>
                    </Tabs.List>

                    <Tabs.Content value="productos" className="mt-4 flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-[260px]">
                                <Input placeholder="Buscar presentación" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                            </div>
                            <Button variant={soloBajoMinimo ? "primary" : "secondary"} size="small" onClick={() => setSoloBajoMinimo((v) => !v)}>
                                Bajo mínimo ({bajoMinimo})
                            </Button>
                        </div>
                        <div className="overflow-x-auto">
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Presentación</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Existencia</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Mínimo</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Máximo</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Lotes</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Costo promedio</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Valor</Table.HeaderCell>
                                        {puedeFijar && <Table.HeaderCell></Table.HeaderCell>}
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {filtrados.map((r) => {
                                        const p = politicas.get(r.variant_id);
                                        return (
                                            <Table.Row key={r.variant_id}>
                                                <Table.Cell>
                                                    {sinVarianteUnica(r.title)}
                                                    {r.quarantined_units > 0 && <Text size="xsmall" className="text-ui-fg-muted">{r.quarantined_units} en cuarentena</Text>}
                                                </Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">
                                                    {p?.below_min ? <Badge size="2xsmall" color="red">{r.units}</Badge> : r.units}
                                                </Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">
                                                    {editando === r.variant_id ? <Input type="number" min="0" step="1" value={limites.min} onChange={(e) => setLimites({ ...limites, min: e.target.value })} style={{ width: 80 }} /> : p ? p.min_quantity : "—"}
                                                </Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">
                                                    {editando === r.variant_id ? <Input type="number" min="0" step="1" value={limites.max} onChange={(e) => setLimites({ ...limites, max: e.target.value })} style={{ width: 80 }} placeholder="—" /> : p?.max_quantity ?? "—"}
                                                </Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">{r.batches}</Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">{dinero(r.average_unit_cost)}</Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">{dinero(r.total_value)}</Table.Cell>
                                                {puedeFijar && (
                                                    <Table.Cell className="text-right">
                                                        {editando === r.variant_id ? (
                                                            <div className="flex justify-end gap-1">
                                                                <Button size="small" variant="secondary" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                                                                <Button size="small" onClick={() => guardarLimites(r)} isLoading={guardando}>Guardar</Button>
                                                            </div>
                                                        ) : (
                                                            <Button size="small" variant="secondary" onClick={() => { setEditando(r.variant_id); setLimites({ min: String(p?.min_quantity ?? ""), max: p?.max_quantity == null ? "" : String(p.max_quantity) }); }}>
                                                                {p ? "Editar" : "Fijar mínimo"}
                                                            </Button>
                                                        )}
                                                    </Table.Cell>
                                                )}
                                            </Table.Row>
                                        );
                                    })}
                                </Table.Body>
                            </Table>
                        </div>
                        {filtrados.length === 0 && <Text className="text-ui-fg-subtle">Nada que mostrar con estos filtros.</Text>}
                    </Tabs.Content>

                    <Tabs.Content value="lotes" className="mt-4">
                        <div className="overflow-x-auto">
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Presentación</Table.HeaderCell>
                                        <Table.HeaderCell>Lote</Table.HeaderCell>
                                        <Table.HeaderCell>Caducidad</Table.HeaderCell>
                                        <Table.HeaderCell>Estante</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Existencia</Table.HeaderCell>
                                        <Table.HeaderCell>Estado</Table.HeaderCell>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {[...lotes]
                                        .sort((a, b) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime())
                                        .map((b) => (
                                            <Table.Row key={b.id}>
                                                <Table.Cell>{sinVarianteUnica(b.variant_title ?? b.variant_id)}</Table.Cell>
                                                <Table.Cell className="font-mono text-xs">{b.batch_number}</Table.Cell>
                                                <Table.Cell>{fecha(b.expiration_date)}</Table.Cell>
                                                <Table.Cell>{b.shelf_location ?? "—"}</Table.Cell>
                                                <Table.Cell className="text-right tabular-nums">{b.quantity}{b.sale_unit ? ` ${b.sale_unit}` : ""}</Table.Cell>
                                                <Table.Cell>
                                                    <Badge size="2xsmall" color={ESTADO_LOTE[b.status]?.color ?? "grey"}>{ESTADO_LOTE[b.status]?.texto ?? b.status}</Badge>
                                                </Table.Cell>
                                            </Table.Row>
                                        ))}
                                </Table.Body>
                            </Table>
                        </div>
                    </Tabs.Content>

                    <Tabs.Content value="movimientos" className="mt-4">
                        <div className="overflow-x-auto">
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Fecha</Table.HeaderCell>
                                        <Table.HeaderCell>Presentación</Table.HeaderCell>
                                        <Table.HeaderCell>Tipo</Table.HeaderCell>
                                        <Table.HeaderCell className="text-right">Cantidad</Table.HeaderCell>
                                        <Table.HeaderCell>Motivo</Table.HeaderCell>
                                        <Table.HeaderCell>Usuario</Table.HeaderCell>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {movimientos.map((m) => (
                                        <Table.Row key={m.id}>
                                            <Table.Cell className="whitespace-nowrap">{fechaHora(m.created_at)}</Table.Cell>
                                            <Table.Cell>{sinVarianteUnica(m.variant_title ?? m.variant_id)}</Table.Cell>
                                            <Table.Cell>{TIPO[m.type] ?? m.type}</Table.Cell>
                                            <Table.Cell className={`text-right tabular-nums ${Number(m.quantity_delta) < 0 ? "text-ui-fg-error" : ""}`}>
                                                {Number(m.quantity_delta) > 0 ? `+${m.quantity_delta}` : m.quantity_delta}
                                            </Table.Cell>
                                            <Table.Cell>{m.reason ?? "—"}</Table.Cell>
                                            <Table.Cell>{String(m.user_email ?? "").replace(/@sigh\.local$/, "") || "—"}</Table.Cell>
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </div>
                    </Tabs.Content>
                </Tabs>
            )}
        </Container>
    );
};

export default DetalleDeAlmacenPage;
