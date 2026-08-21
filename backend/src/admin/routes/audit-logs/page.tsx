import { Container, Heading, Text, Table, Badge, Button } from "@medusajs/ui";
import { ROLES, normalizeRole, roleLabel } from "../../../lib/roles";
import React, { useState, useEffect } from "react";
import { defineRouteConfig } from "@medusajs/admin-sdk";

const AuditLogsPage = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [expandedLog, setExpandedLog] = useState<string | null>(null);

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
            const res = await fetch("/admin/audit-logs");
            const data = await res.json();
            if (data.audit_logs) {
                setLogs(data.audit_logs);
            }
        } catch (e) {
            console.error("Error fetching logs", e);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return (
            <Container className="p-8 flex items-center justify-center min-h-[400px]">
                <Text>Cargando bitácora de auditoría...</Text>
            </Container>
        );
    }

    if (!hasAccess) {
        return (
            <Container className="p-8 flex flex-col items-center justify-center min-h-[400px]">
                <span className="text-4xl mb-4">⛔</span>
                <Heading level="h2">Acceso Denegado</Heading>
                <Text className="text-ui-fg-subtle mt-2">
                    Tu rol no tiene permisos para ver la bitácora inalterable de auditoría.
                </Text>
            </Container>
        );
    }

    const getMethodColor = (method: string) => {
        switch (method) {
            case "POST": return "green";
            case "PUT": return "orange";
            case "DELETE": return "red";
            default: return "grey";
        }
    };

    return (
        <Container className="p-8">
            <div className="mb-8">
                <Heading level="h1">Bitácora de Auditoría 🕵️</Heading>
                <Text className="text-ui-fg-subtle mt-1">
                    Registro inalterable de todas las acciones de modificación, creación, eliminación y logins dentro del sistema.
                </Text>
            </div>

            {logs.length === 0 ? (
                <div className="text-center p-12 border border-dashed border-ui-border-base rounded-lg bg-ui-bg-subtle">
                    <Text className="text-ui-fg-muted">No se han registrado acciones aún.</Text>
                </div>
            ) : (
                <div className="border border-ui-border-base rounded-lg overflow-hidden">
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Fecha / Hora</Table.HeaderCell>
                                <Table.HeaderCell>Usuario / Email</Table.HeaderCell>
                                <Table.HeaderCell>Acción</Table.HeaderCell>
                                <Table.HeaderCell>Endpoint</Table.HeaderCell>
                                <Table.HeaderCell>IP Origen</Table.HeaderCell>
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
                                            <Badge color={getMethodColor(log.method)}>
                                                {log.method}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell className="max-w-[200px] truncate text-xs font-mono" title={log.endpoint}>
                                            {log.endpoint}
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
                                                {expandedLog === log.id ? "Ocultar" : "Ver Datos"}
                                            </Button>
                                        </Table.Cell>
                                    </Table.Row>
                                    
                                    {/* Expandable JSON Row */}
                                    {expandedLog === log.id && (
                                        <Table.Row className="bg-ui-bg-subtle">
                                            <Table.Cell colSpan={6} className="p-4 border-t border-ui-border-base">
                                                <div className="bg-ui-bg-base border border-ui-border-strong rounded-md p-4">
                                                    <Text className="text-xs font-bold mb-2 uppercase text-ui-fg-muted">Datos Enviados (Payload)</Text>
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
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Auditoría",
    icon: "DocumentText",
});

export default AuditLogsPage;
