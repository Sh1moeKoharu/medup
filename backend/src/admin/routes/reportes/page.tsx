import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useMemo, useState } from "react";
import { descargarDesde, imprimirDesde } from "../../lib/imprimir";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Reportes para Excel o impresión, desde el panel. Es la misma ruta que usan
 * Auditoría, RH y Almacén en el punto de venta (`/admin/reports/export`): lo
 * que se ve aquí, lo que se descarga y lo que se imprime sale de una sola
 * función del servidor.
 */

type Definicion = {
    tipo: string;
    etiqueta: string;
    descripcion: string;
    filtros: string[];
    agrupaciones?: { valor: string; etiqueta: string }[];
};

type Columna = { clave: string; etiqueta: string; tipo?: string };
type TablaDeReporte = { titulo: string; subtitulo?: string; columnas: Columna[]; filas: Record<string, unknown>[]; totales?: Record<string, unknown>; notas?: string[] };

const MUESTRA = 100;

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const haceDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const ROLES = [
    ["admin", "Administrador General"],
    ["cashier", "Caja / Recepción"],
    ["doctor", "Médico"],
    ["nurse", "Enfermería"],
    ["pharmacy", "Farmacia"],
    ["warehouse", "Almacén"],
    ["hr", "RH y contabilidad"],
    ["auditor", "Auditor / Dirección"],
];

function celda(valor: unknown, tipo?: string): string {
    if (valor === null || valor === undefined || valor === "") return "";
    if (tipo === "dinero") return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
    if (tipo === "numero") return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(Number(valor));
    if (tipo === "horas") return `${Number(valor).toFixed(2)} h`;
    if (tipo === "fecha" || tipo === "fechahora") {
        const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
        const d = dia ? new Date(Number(dia[1]), Number(dia[2]) - 1, Number(dia[3])) : new Date(String(valor));
        if (Number.isNaN(d.getTime())) return String(valor);
        return tipo === "fecha"
            ? d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
            : d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return String(valor);
}

const ReportesPage = () => {
    const [tipos, setTipos] = useState<Definicion[]>([]);
    const [denegado, setDenegado] = useState(false);
    const [tipo, setTipo] = useState("");
    const [desde, setDesde] = useState(haceDias(6));
    const [hasta, setHasta] = useState(hoy());
    const [rol, setRol] = useState("todos");
    const [persona, setPersona] = useState("");
    const [almacen, setAlmacen] = useState("todos");
    const [almacenes, setAlmacenes] = useState<{ id: string; name: string }[]>([]);
    const [agrupar, setAgrupar] = useState("");
    const [tabla, setTabla] = useState<TablaDeReporte | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/admin/reports/tipos", { credentials: "include" }).then(async (res) => {
            if (esDenegado(res)) return setDenegado(true);
            const data = await res.json().catch(() => ({}));
            setTipos(data.reportes ?? []);
            if (data.reportes?.[0]) setTipo(data.reportes[0].tipo);
        });
        fetch("/admin/stock-locations?fields=id,name&limit=50", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => setAlmacenes(d.stock_locations ?? []))
            .catch(() => {});
    }, []);

    const definicion = tipos.find((t) => t.tipo === tipo);
    const usa = (f: string) => !!definicion?.filtros.includes(f);

    const consulta = useMemo(() => {
        if (!definicion) return null;
        const q = new URLSearchParams({ tipo: definicion.tipo });
        if (usa("rango")) {
            if (desde) q.set("desde", desde);
            if (hasta) q.set("hasta", hasta);
        }
        if (usa("rol") && rol !== "todos") q.set("rol", rol);
        if (usa("persona") && persona.trim()) q.set("persona", persona.trim());
        if (usa("almacen") && almacen !== "todos") q.set("almacen", almacen);
        if (usa("agrupar")) q.set("agrupar", agrupar || definicion.agrupaciones?.[0]?.valor || "");
        return q;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [definicion, desde, hasta, rol, persona, almacen, agrupar]);

    useEffect(() => {
        if (!consulta) return;
        const temporizador = setTimeout(async () => {
            setCargando(true);
            setError(null);
            const res = await fetch(`/admin/reports/export?${consulta.toString()}&formato=json`, { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            setCargando(false);
            if (!res.ok) {
                setTabla(null);
                setError(data.message || "No se pudo armar el reporte.");
                return;
            }
            setTabla(data.tabla);
        }, 300);
        return () => clearTimeout(temporizador);
    }, [consulta]);

    if (denegado) return <SinAcceso recurso="los reportes" />;

    return (
        <Container className="flex flex-col gap-y-4 p-6">
            <div>
                <Heading level="h1">Reportes</Heading>
                <Text className="text-ui-fg-subtle">Elige un reporte y un periodo. Revisa la muestra y descárgalo para Excel o imprímelo.</Text>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {tipos.map((t) => (
                    <button
                        key={t.tipo}
                        type="button"
                        onClick={() => {
                            setTipo(t.tipo);
                            setAgrupar("");
                        }}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                            t.tipo === tipo ? "border-ui-border-interactive bg-ui-bg-highlight" : "border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-base-hover"
                        }`}
                    >
                        <Text weight="plus">{t.etiqueta}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                            {t.descripcion}
                        </Text>
                    </button>
                ))}
            </div>

            {definicion && (
                <div className="flex flex-wrap items-end gap-3">
                    {usa("rango") && (
                        <>
                            <div>
                                <Text size="small" className="text-ui-fg-subtle">Desde</Text>
                                <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                            </div>
                            <div>
                                <Text size="small" className="text-ui-fg-subtle">Hasta</Text>
                                <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                            </div>
                        </>
                    )}
                    {usa("agrupar") && definicion.agrupaciones && (
                        <div className="min-w-[160px]">
                            <Text size="small" className="text-ui-fg-subtle">Agrupar</Text>
                            <Select value={agrupar || definicion.agrupaciones[0].valor} onValueChange={setAgrupar}>
                                <Select.Trigger><Select.Value /></Select.Trigger>
                                <Select.Content>
                                    {definicion.agrupaciones.map((a) => (
                                        <Select.Item key={a.valor} value={a.valor}>{a.etiqueta}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select>
                        </div>
                    )}
                    {usa("rol") && (
                        <div className="min-w-[200px]">
                            <Text size="small" className="text-ui-fg-subtle">Perfil</Text>
                            <Select value={rol} onValueChange={setRol}>
                                <Select.Trigger><Select.Value /></Select.Trigger>
                                <Select.Content>
                                    <Select.Item value="todos">Todos los perfiles</Select.Item>
                                    {ROLES.map(([v, e]) => (
                                        <Select.Item key={v} value={v}>{e}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select>
                        </div>
                    )}
                    {usa("persona") && (
                        <div className="min-w-[220px]">
                            <Text size="small" className="text-ui-fg-subtle">Persona</Text>
                            <Input value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Usuario, nombre o número" />
                        </div>
                    )}
                    {usa("almacen") && (
                        <div className="min-w-[200px]">
                            <Text size="small" className="text-ui-fg-subtle">Almacén</Text>
                            <Select value={almacen} onValueChange={setAlmacen}>
                                <Select.Trigger><Select.Value /></Select.Trigger>
                                <Select.Content>
                                    <Select.Item value="todos">Todos los almacenes</Select.Item>
                                    {almacenes.map((a) => (
                                        <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>
                                    ))}
                                </Select.Content>
                            </Select>
                        </div>
                    )}
                    <div className="ml-auto flex gap-2">
                        <Button
                            disabled={!tabla}
                            onClick={async () => {
                                const e = await descargarDesde(`/admin/reports/export?${consulta}&formato=csv`, `${tipo}.csv`);
                                if (e) alert(e);
                            }}
                        >
                            Descargar para Excel
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={!tabla}
                            onClick={async () => {
                                const e = await imprimirDesde(`/admin/reports/export?${consulta}&formato=html`);
                                if (e) alert(e);
                            }}
                        >
                            Imprimir
                        </Button>
                    </div>
                </div>
            )}

            {error && <Text className="text-ui-fg-error">{error}</Text>}
            {cargando && !tabla && <Text className="text-ui-fg-subtle">Armando el reporte…</Text>}

            {tabla && (
                <div className="flex flex-col gap-2">
                    <div>
                        <Heading level="h2">{tabla.titulo}</Heading>
                        <Text size="small" className="text-ui-fg-subtle">
                            {tabla.subtitulo ? `${tabla.subtitulo} · ` : ""}
                            {tabla.filas.length} {tabla.filas.length === 1 ? "registro" : "registros"}
                            {tabla.filas.length > MUESTRA ? ` · se muestran los primeros ${MUESTRA}` : ""}
                        </Text>
                    </div>
                    <div className="overflow-x-auto">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    {tabla.columnas.map((c) => (
                                        <Table.HeaderCell key={c.clave} className="whitespace-nowrap">{c.etiqueta}</Table.HeaderCell>
                                    ))}
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {tabla.filas.slice(0, MUESTRA).map((f, i) => (
                                    <Table.Row key={i}>
                                        {tabla.columnas.map((c) => (
                                            <Table.Cell key={c.clave} className={["numero", "dinero", "horas"].includes(c.tipo ?? "") ? "text-right tabular-nums" : ""}>
                                                {celda(f[c.clave], c.tipo)}
                                            </Table.Cell>
                                        ))}
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </div>
                    {tabla.filas.length === 0 && <Text className="text-ui-fg-subtle">Sin registros en este periodo.</Text>}
                    {(tabla.notas ?? []).map((n) => (
                        <Text key={n} size="small" className="text-ui-fg-subtle">{n}</Text>
                    ))}
                </div>
            )}
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Reportes",
});

export default ReportesPage;
