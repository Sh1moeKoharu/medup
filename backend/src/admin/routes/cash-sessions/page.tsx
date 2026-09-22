import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Table, Badge, Button, Input } from "@medusajs/ui";
import { ROLES } from "../../../lib/roles";
import { CuadroDeMotivo, enviar } from "../../lib/motivo";
import { useCurrentRole } from "../../lib/use-current-role";
import { useEffect, useState } from "react";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

interface CashSession {
    id: string;
    opened_at: string;
    closed_at: string | null;
    opening_amount: number;
    expected_closing_amount: number | null;
    actual_closing_amount: number | null;
    difference: number | null;
    cashier_name: string;
    status: "open" | "closed";
    notes: string | null;
}

interface CashSessionSummary {
    opening_amount: number;
    sales_cash: number;
    sales_card: number;
    sales_transfer: number;
    sales_total: number;
    refunds_total: number;
    cash_in_total: number;
    cash_out_total: number;
    transaction_count: number;
    expected_cash_in_register: number;
    total_revenue: number;
}

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
    }).format(amount);

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

const CashSessionsPage = () => {
    const [sessions, setSessions] = useState<CashSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [selectedSession, setSelectedSession] = useState<CashSession | null>(null);
    const [selectedSummary, setSelectedSummary] = useState<CashSessionSummary | null>(null);
    // En la clínica hay UNA sola caja: una que se quedó abierta bloquea a todos.
    // Administración la cierra por la persona, con lo contado y el motivo.
    const { role } = useCurrentRole();
    const [cerrando, setCerrando] = useState<string | null>(null);
    const [contado, setContado] = useState("");
    const [enviando, setEnviando] = useState(false);
    const cerrarAjena = async (session: CashSession, motivo: string) => {
        setEnviando(true);
        const { error, data } = await enviar(`/admin/cash-sessions/${session.id}/close`, { actual_closing_amount: Number(contado) || 0, motivo });
        setEnviando(false);
        if (error) return alert(error);
        alert(`Caja cerrada. Esperado ${formatCurrency(data.summary.expected_cash)}, contado ${formatCurrency(data.summary.actual_cash)}: ${data.summary.difference_label}.`);
        setCerrando(null);
        setContado("");
        fetchSessions();
    };

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const res = await fetch("/admin/cash-sessions?limit=50", {
                credentials: "include",
            });
            if (esDenegado(res)) { setDenegado(true); return; }
            const data = await res.json();
            setSessions(data.sessions || []);
        } catch (err) {
            console.error("Error fetching sessions:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async (id: string) => {
        try {
            const res = await fetch(`/admin/cash-sessions/${id}/summary`, {
                credentials: "include",
            });
            const data = await res.json();
            setSelectedSummary(data.summary);
        } catch (err) {
            console.error("Error fetching summary:", err);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleViewDetails = (session: CashSession) => {
        setSelectedSession(session);
        fetchSummary(session.id);
    };

    if (denegado) return <SinAcceso recurso="los cortes de caja" />;

    return (
        <Container>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                    <Heading level="h1">Cortes de caja</Heading>
                    <Text size="small" style={{ color: "var(--fg-muted)", marginTop: 4 }}>
                        Historial de sesiones de caja y cortes
                    </Text>
                </div>
                <Button variant="secondary" onClick={fetchSessions} disabled={loading}>
                    {loading ? "Cargando..." : "Actualizar"}
                </Button>
            </div>

            {/* ── Detalle de Sesión Seleccionada ── */}
            {selectedSession && selectedSummary && (
                <Container style={{ marginBottom: 24, background: "var(--bg-subtle)", borderRadius: 8, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div>
                            <Heading level="h2">
                                Corte: {selectedSession.cashier_name}
                            </Heading>
                            <Text size="small" style={{ color: "var(--fg-muted)" }}>
                                {formatDate(selectedSession.opened_at)}
                                {selectedSession.closed_at && ` → ${formatDate(selectedSession.closed_at)}`}
                            </Text>
                        </div>
                        <Button variant="secondary" size="small" onClick={() => {
                            setSelectedSession(null);
                            setSelectedSummary(null);
                        }}>
                            Cerrar
                        </Button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                        <SummaryCard label="Total de ventas" value={formatCurrency(selectedSummary.sales_total)} />
                        <SummaryCard label="Transacciones" value={String(selectedSummary.transaction_count)} />
                        <SummaryCard label="Ingresos netos" value={formatCurrency(selectedSummary.total_revenue)} />
                        <SummaryCard
                            label="Efectivo esperado"
                            value={formatCurrency(selectedSummary.expected_cash_in_register)}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "var(--fg-muted)" }}>Efectivo</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_cash)}</Text>
                        </div>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "var(--fg-muted)" }}>Tarjeta</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_card)}</Text>
                        </div>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "var(--fg-muted)" }}>Transferencia</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_transfer)}</Text>
                        </div>
                    </div>

                    {selectedSession.status === "closed" && selectedSession.difference !== null && (
                        <div style={{
                            ...cardStyle,
                            borderColor: selectedSession.difference === 0 ? "var(--tag-green-border)"
                                : selectedSession.difference > 0 ? "var(--border-interactive)" : "var(--tag-red-border)",
                            borderWidth: 2,
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <Text size="small" style={{ color: "var(--fg-muted)" }}>Resultado del corte</Text>
                                    <Text weight="plus" style={{ fontSize: 18 }}>
                                        {selectedSession.difference === 0
                                           ? "Caja cuadrada"
                                            : selectedSession.difference > 0
                                               ? `Sobrante: ${formatCurrency(selectedSession.difference)}`
                                               : `Faltante: ${formatCurrency(Math.abs(selectedSession.difference))}`}
                                    </Text>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <Text size="small" style={{ color: "var(--fg-muted)" }}>Contado</Text>
                                    <Text weight="plus">
                                        {formatCurrency(Number(selectedSession.actual_closing_amount) || 0)}
                                    </Text>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedSession.notes && (
                        <div style={{ marginTop: 12 }}>
                            <Text size="small" style={{ color: "var(--fg-muted)" }}>Observaciones:</Text>
                            <Text>{selectedSession.notes}</Text>
                        </div>
                    )}
                </Container>
            )}

            {/* ── Tabla de Sesiones ── */}
            <div style={{ overflowX: "auto", width: "100%" }}>
                {/* Scroll horizontal: la tabla es mas ancha que una tableta en vertical y,
                    sin este contenedor, las columnas de la derecha se recortan sin manera
                    de llegar a ellas. */}
            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Cajero</Table.HeaderCell>
                        <Table.HeaderCell>Apertura</Table.HeaderCell>
                        <Table.HeaderCell>Cierre</Table.HeaderCell>
                        <Table.HeaderCell>Fondo inicial</Table.HeaderCell>
                        <Table.HeaderCell>Ventas</Table.HeaderCell>
                        <Table.HeaderCell>Diferencia</Table.HeaderCell>
                        <Table.HeaderCell>Estado</Table.HeaderCell>
                        <Table.HeaderCell></Table.HeaderCell>
                    </Table.Row>
                </Table.Header>
                <Table.Body>
                    {sessions.map((session) => (
                        <Table.Row key={session.id}>
                            <Table.Cell>
                                <Text weight="plus">{session.cashier_name}</Text>
                            </Table.Cell>
                            <Table.Cell>
                                <Text size="small">{formatDate(session.opened_at)}</Text>
                            </Table.Cell>
                            <Table.Cell>
                                <Text size="small">
                                    {session.closed_at ? formatDate(session.closed_at) : "—"}
                                </Text>
                            </Table.Cell>
                            <Table.Cell>
                                {formatCurrency(Number(session.opening_amount) || 0)}
                            </Table.Cell>
                            <Table.Cell>
                                {session.expected_closing_amount !== null
                                    ? formatCurrency(Number(session.expected_closing_amount) - Number(session.opening_amount))
                                    : "—"}
                            </Table.Cell>
                            <Table.Cell>
                                {session.difference !== null ? (
                                    <Text
                                        style={{
                                            color: session.difference === 0
                                                ? "var(--tag-green-border)"
                                                : session.difference > 0
                                                    ? "var(--border-interactive)"
                                                    : "var(--tag-red-border)",
                                        }}
                                        weight="plus"
                                    >
                                        {session.difference === 0
                                            ? "Cuadrada"
                                            : session.difference > 0
                                                ? `+${formatCurrency(session.difference)}`
                                                : formatCurrency(session.difference)}
                                    </Text>
                                ) : (
                                    "—"
                                )}
                            </Table.Cell>
                            <Table.Cell>
                                <Badge color={session.status === "open" ? "green" : "grey"}>
                                    {session.status === "open" ? "Abierta" : "Cerrada"}
                                </Badge>
                            </Table.Cell>
                            <Table.Cell>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <Button
                                        variant="secondary"
                                        size="small"
                                        onClick={() => handleViewDetails(session)}
                                    >
                                        Ver detalle
                                    </Button>
                                    {session.status === "open" && role === ROLES.ADMIN && cerrando !== session.id && (
                                        <Button variant="danger" size="small" onClick={() => setCerrando(session.id)}>
                                            Cerrar por {session.cashier_name}
                                        </Button>
                                    )}
                                    {/* El corte lo compone el servidor; aquí sólo se abre
                                        en una pestaña lista para imprimir. */}
                                    <Button
                                        variant="secondary"
                                        size="small"
                                        onClick={async () => {
                                            const res = await fetch(`/admin/documents/corte/${session.id}`, { credentials: "include" });
                                            const data = await res.json().catch(() => ({}));
                                            if (!res.ok || !data.html) {
                                                alert(data.error || data.message || "No se pudo obtener el corte.");
                                                return;
                                            }
                                            const w = window.open("", "_blank");
                                            if (!w) {
                                                alert("El navegador bloqueó la pestaña del corte. Permite ventanas emergentes para este sitio.");
                                                return;
                                            }
                                            w.document.open();
                                            w.document.write(data.html);
                                            w.document.close();
                                            w.focus();
                                            setTimeout(() => w.print(), 400);
                                        }}
                                    >
                                        Imprimir corte
                                    </Button>
                                </div>
                            </Table.Cell>
                        </Table.Row>
                    ))}
                    {cerrando && sessions.find((s) => s.id === cerrando) && (
                        <Table.Row>
                            {/* @ts-ignore */}
                            <Table.Cell colSpan={8}>
                                <CuadroDeMotivo
                                    titulo={`Cerrar la caja de ${sessions.find((s) => s.id === cerrando)!.cashier_name}`}
                                    descripcion="Cuenta el efectivo del cajón y escríbelo. El corte dirá que la cerró Administración y por qué."
                                    etiqueta="Cerrar caja"
                                    enviando={enviando}
                                    onCancelar={() => setCerrando(null)}
                                    onConfirmar={(m) => cerrarAjena(sessions.find((s) => s.id === cerrando)!, m)}
                                >
                                    <div style={{ maxWidth: 220 }}>
                                        <Text size="xsmall">Efectivo contado</Text>
                                        <Input type="number" min="0" step="0.01" value={contado} onChange={(e) => setContado(e.target.value)} />
                                    </div>
                                </CuadroDeMotivo>
                            </Table.Cell>
                        </Table.Row>
                    )}
                    {sessions.length === 0 && !loading && (
                        <Table.Row>
                            {/* @ts-ignore */}
                            <Table.Cell colSpan={8}>
                                <Text style={{ textAlign: "center", color: "var(--fg-subtle)", padding: 20 }}>
                                    No hay sesiones de caja registradas
                                </Text>
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table>
            </div>
        </Container>
    );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
    <div style={cardStyle}>
        <Text size="small" style={{ color: "var(--fg-muted)" }}>{label}</Text>
        <Text weight="plus" style={{ fontSize: 16 }}>{value}</Text>
    </div>
);

const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 8,
    padding: 12,
    border: "1px solid var(--border-base)",
};

export const config = defineRouteConfig({
    label: "Cortes de caja",
});

export default CashSessionsPage;
