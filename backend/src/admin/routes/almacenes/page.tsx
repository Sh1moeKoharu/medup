import { defineRouteConfig } from "@medusajs/admin-sdk";
import { BuildingStorefront } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { imprimirDesde } from "../../lib/imprimir";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Los almacenes de la clínica y lo que hay en cada uno.
 *
 * Hasta ahora el panel no tenía dónde ver un almacén: había lotes y kardex,
 * pero no «qué hay en Enfermería y cuánto vale». Cada fila lleva al detalle
 * (productos, lotes y movimientos) y se puede imprimir el inventario de uno o
 * de todos, con el mismo reporte que sale en Auditoría.
 */

type Fila = {
    id: string;
    name: string;
    area: string | null;
    presentaciones: number;
    unidades: number;
    lotes: number;
    valor: number | null;
    sin_costo: number;
};

const ETIQUETA_AREA: Record<string, string> = { pharmacy: "Almacén general y Farmacia", nursing: "Enfermería" };

const dinero = (n: number | null | undefined) =>
    n === null || n === undefined ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

const AlmacenesPage = () => {
    const [filas, setFilas] = useState<Fila[]>([]);
    const [cargando, setCargando] = useState(true);
    const [denegado, setDenegado] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/admin/stock-locations?fields=id,name,metadata&limit=50", { credentials: "include" });
                if (esDenegado(res)) return setDenegado(true);
                const { stock_locations = [] } = await res.json();
                const resumenes = await Promise.all(
                    stock_locations.map(async (l: any) => {
                        const r = await fetch(`/admin/inventory-reports/valuation?stock_location_id=${l.id}&include_quarantined=true`, { credentials: "include" });
                        const d = r.ok ? await r.json() : { items: [], summary: {} };
                        return {
                            id: l.id,
                            name: l.name,
                            area: l.metadata?.altus_area ?? null,
                            presentaciones: d.items?.length ?? 0,
                            unidades: d.summary?.total_units ?? 0,
                            lotes: d.summary?.total_batches ?? 0,
                            valor: d.summary?.total_value ?? null,
                            sin_costo: d.summary?.unvalued_variants ?? 0,
                        } as Fila;
                    })
                );
                setFilas(resumenes);
            } finally {
                setCargando(false);
            }
        })();
    }, []);

    if (denegado) return <SinAcceso recurso="los almacenes" />;

    const total = filas.reduce((s, f) => s + (f.valor ?? 0), 0);

    return (
        <Container className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Heading level="h1">Almacenes</Heading>
                    <Text className="text-ui-fg-subtle">Qué hay en cada almacén y cuánto vale, a costo promedio de compra. Abre uno para ver sus productos y lotes.</Text>
                </div>
                <Button
                    variant="secondary"
                    onClick={async () => {
                        const e = await imprimirDesde("/admin/reports/export?tipo=inventario&formato=html");
                        if (e) alert(e);
                    }}
                >
                    Imprimir inventario de todos
                </Button>
            </div>

            {cargando ? (
                <Text className="text-ui-fg-subtle">Cargando…</Text>
            ) : (
                <div className="overflow-x-auto">
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Almacén</Table.HeaderCell>
                                <Table.HeaderCell>Área</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Presentaciones</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Lotes</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Unidades</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Valor</Table.HeaderCell>
                                <Table.HeaderCell></Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filas.map((f) => (
                                <Table.Row key={f.id}>
                                    <Table.Cell>
                                        <Link to={`/almacenes/${f.id}`} className="text-ui-fg-interactive hover:underline">{f.name}</Link>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {f.area ? <Badge size="2xsmall" color={f.area === "nursing" ? "orange" : "blue"}>{ETIQUETA_AREA[f.area] ?? f.area}</Badge> : <Text size="small" className="text-ui-fg-muted">Sin área</Text>}
                                    </Table.Cell>
                                    <Table.Cell className="text-right tabular-nums">{f.presentaciones}</Table.Cell>
                                    <Table.Cell className="text-right tabular-nums">{f.lotes}</Table.Cell>
                                    <Table.Cell className="text-right tabular-nums">{f.unidades}</Table.Cell>
                                    <Table.Cell className="text-right tabular-nums">
                                        {dinero(f.valor)}
                                        {f.sin_costo > 0 && <Text size="xsmall" className="text-ui-fg-muted">{f.sin_costo} sin costo</Text>}
                                    </Table.Cell>
                                    <Table.Cell className="text-right">
                                        <Link to={`/almacenes/${f.id}`}>
                                            <Button size="small" variant="secondary">Ver detalle</Button>
                                        </Link>
                                    </Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}
            {!cargando && filas.length > 0 && (
                <Text size="small" className="text-right text-ui-fg-subtle">Valor total del inventario: <b>{dinero(Math.round(total * 100) / 100)}</b></Text>
            )}
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Almacenes",
    icon: BuildingStorefront,
});

export default AlmacenesPage;
