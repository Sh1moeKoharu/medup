import { Container, Heading, Text, Table, Badge, Button, Input, Select } from "@medusajs/ui";
import { clasificarAccion } from "../../../lib/acciones";
import { ALL_ROLES, ROLES, ROLE_LABELS, normalizeRole, roleLabel } from "../../../lib/roles";
import React, { useState, useEffect } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";
import { SinAcceso } from "../../lib/sin-acceso";

const AuditLogsPage = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [, setCurrentUser] = useState<any>(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [expandedLog, setExpandedLog] = useState<string | null>(null);

    // Filtros y paginación: los aplica el SERVIDOR (ver lib/bitacora.ts);
    // aquí sólo se arma la consulta.
    const POR_PAGINA = 50;
    const [desde, setDesde] = useState("");
    const [hasta, setHasta] = useState("");
    const [rol, setRol] = useState("todos");
    const [usuario, setUsuario] = useState("");
    const [numero, setNumero] = useState("");
    const [metodo, setMetodo] = useState("todos");
    const [pagina, setPagina] = useState(0);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        // 1. Verificar permisos
        fetch("/admin/users/me", { credentials: "include" })
            .then(res => res.json())
            .then(data => {
                if (data.user) {
                    setCurrentUser(data.user);
                    const role = data.user.metadata?.role;
                    // Solo admin y auditor tienen acceso
                    const canonical = normalizeRole(role);
                    if (!role || canonical === ROLES.ADMIN || canonical === ROLES.AUDITOR) {
                        setHasAccess(true);
                        fetchLogs();
                    } else {
                        setIsLoading(false);
                    }
                }
            })
            .catch(err => {
                console.error(err);
                setIsLoading(false);
            });
    }, []);

    const fetchLogs = async () => {
        try {
            const q = new URLSearchParams();
            if (desde) q.set("from", desde);
            if (hasta) q.set("to", hasta);
            if (rol !== "todos") q.set("user_role", rol);
            if (usuario.trim()) q.set("user_email", usuario.trim());
            if (numero.trim()) q.set("employee_number", numero.trim());
            if (metodo !== "todos") q.set("method", metodo);
            q.set("limit", String(POR_PAGINA));
            q.set("offset", String(pagina * POR_PAGINA));
            const res = await fetch(`/admin/audit-logs?${q.toString()}`, { credentials: "include" });
            const data = await res.json();
            if (data.audit_logs) {
                setLogs(data.audit_logs);
                setTotal(Number(data.count) || 0);
            }
        } catch (e) {
            console.error("Error fetching logs", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (hasAccess) fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [desde, hasta, rol, usuario, numero, metodo, pagina, hasAccess]);

    if (isLoading) {
        return (
            <Container className="p-8 flex items-center justify-center min-h-[400px]">
                <Text>Cargando bitácora de auditoría...</Text>
            </Container>
        );
    }

    if (!hasAccess) {
        return <SinAcceso recurso="la bitácora" />;
    }

    const getMethodColor = (method: string) => {
        switch (method) {
            case "POST": return "green";
            case "PUT": return "orange";
            case "DELETE": return "red";
            case "GET": return "blue";
            default: return "grey";
        }
    };

    return (
        <Container className="p-8">
            <div className="mb-8">
                <Heading level="h1">Bitácora de auditoría</Heading>
                <Text className="text-ui-fg-subtle mt-1">
                    Registro inalterable de las acciones de modificación, creación, eliminación y accesos, y de las consultas al expediente de un paciente (quién miró qué).
                </Text>
            </div>

            <div className="flex flex-wrap gap-3 mb-4 items-end">
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Desde</Text>
                    <Input type="date" value={desde} onChange={(e) => { setPagina(0); setDesde(e.target.value); }} />
                </div>
                <div>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Hasta</Text>
                    <Input type="date" value={hasta} onChange={(e) => { setPagina(0); setHasta(e.target.value); }} />
                </div>
                <div style={{ width: 200 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Perfil</Text>
                    <Select value={rol} onValueChange={(v) => { setPagina(0); setRol(v); }}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                            <Select.Item value="todos">Todos</Select.Item>
                            {ALL_ROLES.map((r) => <Select.Item key={r} value={r}>{ROLE_LABELS[r]}</Select.Item>)}
                        </Select.Content>
                    </Select>
                </div>
                <div style={{ width: 160 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Usuario</Text>
                    <Input value={usuario} placeholder="caja" onChange={(e) => { setPagina(0); setUsuario(e.target.value); }} />
                </div>
                <div style={{ width: 130 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Nº empleado</Text>
                    <Input value={numero} placeholder="0003" onChange={(e) => { setPagina(0); setNumero(e.target.value); }} />
                </div>
                <div style={{ width: 150 }}>
                    <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Acción</Text>
                    <Select value={metodo} onValueChange={(v) => { setPagina(0); setMetodo(v); }}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                            <Select.Item value="todos">Todas</Select.Item>
                            <Select.Item value="GET">Consulta</Select.Item>
                            <Select.Item value="POST">Alta / acción</Select.Item>
                            <Select.Item value="PUT">Modificación</Select.Item>
                            <Select.Item value="DELETE">Baja</Select.Item>
                        </Select.Content>
                    </Select>
                </div>
                <Text size="small" className="text-ui-fg-subtle" style={{ marginBottom: 8 }}>
                    {total} asiento(s){total > POR_PAGINA ? ` · página ${pagina + 1} de ${Math.ceil(total / POR_PAGINA)}` : ""}
                </Text>
            </div>

            {logs.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-ui-border-base rounded-lg bg-ui-bg-subtle">
                    <Text className="text-ui-fg-muted">{total === 0 && !desde && !hasta && rol === "todos" && !usuario && !numero && metodo === "todos" ? "No se han registrado acciones aún." : "Ningún asiento coincide con los filtros."}</Text>
                </div>
            ) : (
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Fecha / Hora</Table.HeaderCell>
                                <Table.HeaderCell>Usuario / Email</Table.HeaderCell>
                                <Table.HeaderCell>Qué hizo</Table.HeaderCell>
                                <Table.HeaderCell>IP de origen</Table.HeaderCell>
                                <Table.HeaderCell className="text-right">Detalle</Table.HeaderCell>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {logs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <Table.Row className="hover:bg-ui-bg-subtle">
                                        <Table.Cell className="text-xs text-ui-fg-subtle">
                                            {new Date(log.created_at).toLocaleString()}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <div className="flex flex-col">
                                                <span className="font-medium text-sm">
                                                    {log.user_email || "— sin identificar —"}
                                                    {/* El número de empleado que tenía al actuar. */}
                                                    {log.user_employee_number && (
                                                        <span className="font-normal text-ui-fg-muted"> · Nº {log.user_employee_number}</span>
                                                    )}
                                                </span>
                                                {/* Rol vigente al momento de la acción: si después le
                                                    cambian el rol, el asiento conserva con qué autoridad actuó. */}
                                                {log.user_role && (
                                                    <span className="text-xs text-ui-fg-muted">
                                                        {roleLabel(log.user_role)}
                                                    </span>
                                                )}
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell>
                                            {/* En palabras: la bitácora se lee, no se descifra. La
                                                ruta queda debajo para quien audite de verdad. */}
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm">{clasificarAccion(log.method, log.endpoint).descripcion}</span>
                                                {String(log.endpoint ?? "").startsWith("/") && (
                                                    <span className="flex items-center gap-1">
                                                        <Badge size="2xsmall" color={getMethodColor(log.method)}>{log.method}</Badge>
                                                        <span className="max-w-[260px] truncate font-mono text-xs text-ui-fg-muted" title={log.endpoint}>{log.endpoint}</span>
                                                    </span>
                                                )}
                                            </div>
                                        </Table.Cell>
                                        <Table.Cell className="text-xs text-ui-fg-subtle">
                                            {log.ip_address}
                                        </Table.Cell>
                                        <Table.Cell className="text-right">
                                            <Button 
                                                variant="secondary" 
                                                size="small"
                                                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                            >
                                                {expandedLog === log.id ? "Ocultar" : "Ver datos"}
                                            </Button>
                                        </Table.Cell>
                                    </Table.Row>
                                    
                                    {/* Expandable JSON Row */}
                                    {expandedLog === log.id && (
                                        <Table.Row className="bg-ui-bg-subtle">
                                            {/* `Table.Cell` de Medusa no declara `colSpan` en sus
                                                tipos, aunque renderiza un <td> que sí lo soporta.
                                                Se pasa con cast para no perder la fusión de columnas. */}
                                            <Table.Cell
                                                {...({ colSpan: 5 } as any)}
                                                className="p-4 border-t border-ui-border-base"
                                            >
                                                <div className="bg-ui-bg-base border border-ui-border-strong rounded-md p-4">
                                                    <Text className="text-xs font-bold mb-2 uppercase text-ui-fg-muted">Datos enviados (Payload)</Text>
                                                    <pre className="text-xs font-mono whitespace-pre-wrap break-words text-ui-fg-base overflow-x-auto">
                                                        {JSON.stringify(log.payload, null, 2)}
                                                    </pre>
                                                </div>
                                            </Table.Cell>
                                        </Table.Row>
                                    )}
                                </React.Fragment>
                            ))}
                        </Table.Body>
                    </Table>
                </div>
            )}

            {total > POR_PAGINA && (
                <div className="flex items-center gap-2 mt-4">
                    <Button variant="secondary" size="small" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                    <Text size="small" className="text-ui-fg-subtle">Página {pagina + 1} de {Math.ceil(total / POR_PAGINA)}</Text>
                    <Button variant="secondary" size="small" disabled={(pagina + 1) * POR_PAGINA >= total} onClick={() => setPagina((p) => p + 1)}>Siguiente</Button>
                </div>
            )}
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Auditoría",
    icon: DocumentText,
});

export default AuditLogsPage;
