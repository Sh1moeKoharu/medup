import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Table, Badge, Button } from "@medusajs/ui";
import { useEffect, useState } from "react";

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
    const [selectedSession, setSelectedSession] = useState<CashSession | null>(null);
    const [selectedSummary, setSelectedSummary] = useState<CashSessionSummary | null>(null);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const res = await fetch("/admin/cash-sessions?limit=50", {
                credentials: "include",
            });
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

    return (
        <Container>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div>
                    <Heading level="h1">Cortes de Caja</Heading>
                    <Text size="small" style={{ color: "#6b7280", marginTop: 4 }}>
                        Historial de sesiones de caja y cortes
                    </Text>
                </div>
                <Button variant="secondary" onClick={fetchSessions} disabled={loading}>
                    {loading ? "Cargando..." : "Actualizar"}
                </Button>
            </div>

            {/* ── Detalle de Sesión Seleccionada ── */}
            {selectedSession && selectedSummary && (
                <Container style={{ marginBottom: 24, background: "#f9fafb", borderRadius: 8, padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div>
                            <Heading level="h2">
                                Corte: {selectedSession.cashier_name}
                            </Heading>
                            <Text size="small" style={{ color: "#6b7280" }}>
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
                        <SummaryCard label="Total Ventas" value={formatCurrency(selectedSummary.sales_total)} />
                        <SummaryCard label="Transacciones" value={String(selectedSummary.transaction_count)} />
                        <SummaryCard label="Ingresos Netos" value={formatCurrency(selectedSummary.total_revenue)} />
                        <SummaryCard
                            label="Efectivo Esperado"
                            value={formatCurrency(selectedSummary.expected_cash_in_register)}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "#6b7280" }}>Efectivo</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_cash)}</Text>
                        </div>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "#6b7280" }}>Tarjeta</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_card)}</Text>
                        </div>
                        <div style={cardStyle}>
                            <Text size="small"style={{ color: "#6b7280" }}>Transferencia</Text>
                            <Text weight="plus">{formatCurrency(selectedSummary.sales_transfer)}</Text>
                        </div>
                    </div>

                    {selectedSession.status === "closed" && selectedSession.difference !== null && (
                        <div style={{
                            ...cardStyle,
                            borderColor: selectedSession.difference === 0 ? "#10b981"
                                : selectedSession.difference > 0 ? "#3b82f6" : "#ef4444",
                            borderWidth: 2,
                        }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                    <Text size="small" style={{ color: "#6b7280" }}>Resultado del corte</Text>
                                    <Text weight="plus" style={{ fontSize: 18 }}>
                                        {selectedSession.difference === 0
                                           ? "Caja Cuadrada"
                                            : selectedSession.difference > 0
                                               ? `Sobrante: ${formatCurrency(selectedSession.difference)}`
                                               : `Faltante: ${formatCurrency(Math.abs(selectedSession.difference))}`}
                                    </Text>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                    <Text size="small" style={{ color: "#6b7280" }}>Contado</Text>
                                    <Text weight="plus">
                                        {formatCurrency(Number(selectedSession.actual_closing_amount) || 0)}
                                    </Text>
                                </div>
                            </div>
                        </div>
                    )}

                    {selectedSession.notes && (
                        <div style={{ marginTop: 12 }}>
                            <Text size="small" style={{ color: "#6b7280" }}>Observaciones:</Text>
                            <Text>{selectedSession.notes}</Text>
                        </div>
                    )}
                </Container>
            )}

            {/* ── Tabla de Sesiones ── */}
            <Table>
                <Table.Header>
                    <Table.Row>
                        <Table.HeaderCell>Cajero</Table.HeaderCell>
                        <Table.HeaderCell>Apertura</Table.HeaderCell>
                        <Table.HeaderCell>Cierre</Table.HeaderCell>
                        <Table.HeaderCell>Fondo Inicial</Table.HeaderCell>
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
                                                ? "#10b981"
                                                : session.difference > 0
                                                    ? "#3b82f6"
                                                    : "#ef4444",
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
                                <Button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => handleViewDetails(session)}
                                >
                                    Ver Detalle
                                </Button>
                            </Table.Cell>
                        </Table.Row>
                    ))}
                    {sessions.length === 0 && !loading && (
                        <Table.Row>
                            {/* @ts-ignore */}
                            <Table.Cell colSpan={8}>
                                <Text style={{ textAlign: "center", color: "#9ca3af", padding: 20 }}>
                                    No hay sesiones de caja registradas
                                </Text>
                            </Table.Cell>
                        </Table.Row>
                    )}
                </Table.Body>
            </Table>
        </Container>
    );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
    <div style={cardStyle}>
        <Text size="small" style={{ color: "#6b7280" }}>{label}</Text>
        <Text weight="plus" style={{ fontSize: 16 }}>{value}</Text>
    </div>
);

const cardStyle: React.CSSProperties = {
    background: "white",
    borderRadius: 8,
    padding: 12,
    border: "1px solid #e5e7eb",
};

export const config = defineRouteConfig({
    label: "Cortes de Caja",
});

export default CashSessionsPage;
