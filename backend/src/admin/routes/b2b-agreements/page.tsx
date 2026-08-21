import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ROLES, normalizeRole } from "../../../lib/roles";
import { Container, Heading, Text, Badge, Button, Input, Label, Select, Table, Textarea } from "@medusajs/ui";
import { useState, useEffect } from "react";

type Agreement = {
    id: string; company_name: string; rfc: string | null; contact_name: string | null;
    contact_email: string | null; contact_phone: string | null; discount_percent: number;
    credit_limit: number; payment_terms_days: number; status: string;
    valid_from: string | null; valid_until: string | null; notes: string | null;
    created_at: string; updated_at: string;
};

const emptyForm = {
    company_name: "", rfc: "", contact_name: "", contact_email: "", contact_phone: "",
    discount_percent: 0, credit_limit: 0, payment_terms_days: 30, status: "active",
    valid_from: "", valid_until: "", notes: "",
};

const B2BAgreementsPage = () => {
    const [agreements, setAgreements] = useState<Agreement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("__all__");
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [isAuditor, setIsAuditor] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState("");

    useEffect(() => {
        loadAgreements();
        fetch("/admin/users/me", { credentials: "include" })
            .then(r => r.json())
            .then(d => { if (normalizeRole(d.user?.metadata?.role) === ROLES.AUDITOR) setIsAuditor(true); })
            .catch(() => {});
    }, []);

    const loadAgreements = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/admin/b2b-agreements");
            if (res.ok) {
                const data = await res.json();
                setAgreements(data.b2b_agreements || []);
            }
        } catch (err) { console.error("Error loading agreements:", err); }
        finally { setIsLoading(false); }
    };

    const handleOpenCreate = () => {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    };

    const handleOpenEdit = (a: Agreement) => {
        setForm({
            company_name: a.company_name || "", rfc: a.rfc || "",
            contact_name: a.contact_name || "", contact_email: a.contact_email || "",
            contact_phone: a.contact_phone || "", discount_percent: a.discount_percent ?? 0,
            credit_limit: a.credit_limit ?? 0, payment_terms_days: a.payment_terms_days ?? 30,
            status: a.status || "active",
            valid_from: a.valid_from ? a.valid_from.substring(0, 10) : "",
            valid_until: a.valid_until ? a.valid_until.substring(0, 10) : "",
            notes: a.notes || "",
        });
        setEditingId(a.id);
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.company_name.trim()) { alert("El nombre de la empresa es obligatorio."); return; }
        setIsSaving(true);
        try {
            const url = editingId ? `/admin/b2b-agreements/${editingId}` : "/admin/b2b-agreements";
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    valid_from: form.valid_from || null,
                    valid_until: form.valid_until || null,
                }),
            });
            if (res.ok) {
                setShowModal(false);
                setSuccessMsg(editingId ? "Convenio actualizado correctamente." : "Convenio creado correctamente.");
                setTimeout(() => setSuccessMsg(""), 3000);
                loadAgreements();
            } else {
                const err = await res.json();
                alert("Error: " + (err.error || "Error desconocido"));
            }
        } catch (err) { alert("Error de conexión."); }
        finally { setIsSaving(false); }
    };

    const handleDelete = async (id: string) => {
        try {
            const res = await fetch(`/admin/b2b-agreements/${id}`, { method: "DELETE" });
            if (res.ok) {
                setDeleteConfirm(null);
                setSuccessMsg("Convenio eliminado.");
                setTimeout(() => setSuccessMsg(""), 3000);
                loadAgreements();
            }
        } catch (err) { alert("Error al eliminar."); }
    };

    const filtered = agreements.filter((a) => {
        if (statusFilter !== "__all__" && a.status !== statusFilter) return false;
        if (searchTerm) {
            const t = searchTerm.toLowerCase();
            return (a.company_name?.toLowerCase().includes(t) || a.rfc?.toLowerCase().includes(t) || a.contact_name?.toLowerCase().includes(t));
        }
        return true;
    });

    const isExpired = (a: Agreement) => a.valid_until && new Date(a.valid_until) < new Date();
    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("es-MX") : "—";
    const fmtMoney = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
    const setField = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

    return (
        <Container className="p-8">
            <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <Heading level="h1" className="text-ui-fg-base text-2xl font-bold">
                            🤝 Convenios B2B
                        </Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-1">
                            Gestión de convenios empresariales: descuentos, crédito y vigencia
                        </Text>
                    </div>
                    {!isAuditor && (
                        <Button variant="primary" size="base" onClick={handleOpenCreate}>
                            + Nuevo Convenio
                        </Button>
                    )}
                </div>

                {successMsg && (
                    <div className="flex items-center gap-2 p-3 bg-ui-tag-green-bg rounded-md border border-ui-tag-green-border">
                        <span>✅</span>
                        <Text className="text-ui-tag-green-text text-sm font-medium">{successMsg}</Text>
                    </div>
                )}

                {/* Filters */}
                <div className="flex items-end gap-4">
                    <div className="flex-1 max-w-[300px]">
                        <Text className="text-sm font-medium text-ui-fg-base mb-1.5">Buscar</Text>
                        <Input placeholder="Empresa, RFC o contacto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="flex-1 max-w-[200px]">
                        <Text className="text-sm font-medium text-ui-fg-base mb-1.5">Estado</Text>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <Select.Trigger><Select.Value placeholder="Todos" /></Select.Trigger>
                            <Select.Content>
                                <Select.Item value="__all__">Todos</Select.Item>
                                <Select.Item value="active">Activos</Select.Item>
                                <Select.Item value="inactive">Inactivos</Select.Item>
                            </Select.Content>
                        </Select>
                    </div>
                </div>

                {/* Table */}
                {isLoading ? (
                    <div className="flex items-center gap-2 py-8">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-ui-fg-base"></div>
                        <Text className="text-ui-fg-subtle">Cargando convenios...</Text>
                    </div>
                ) : filtered.length === 0 ? (
                    <Container className="p-8 text-center">
                        <Text className="text-ui-fg-muted text-lg">
                            {agreements.length === 0 ? "No hay convenios registrados. Crea el primero." : "No se encontraron convenios con los filtros seleccionados."}
                        </Text>
                    </Container>
                ) : (
                    <Container className="p-0 rounded-lg border border-ui-border-base overflow-hidden">
                        <Table>
                            <Table.Header>
                                <Table.Row>
                                    <Table.HeaderCell>Empresa</Table.HeaderCell>
                                    <Table.HeaderCell>RFC</Table.HeaderCell>
                                    <Table.HeaderCell>Contacto</Table.HeaderCell>
                                    <Table.HeaderCell>Descuento</Table.HeaderCell>
                                    <Table.HeaderCell>Crédito</Table.HeaderCell>
                                    <Table.HeaderCell>Plazo</Table.HeaderCell>
                                    <Table.HeaderCell>Estado</Table.HeaderCell>
                                    <Table.HeaderCell>Vigencia</Table.HeaderCell>
                                    {!isAuditor && <Table.HeaderCell></Table.HeaderCell>}
                                </Table.Row>
                            </Table.Header>
                            <Table.Body>
                                {filtered.map((a) => (
                                    <Table.Row key={a.id} className="cursor-pointer hover:bg-ui-bg-subtle-hover" onClick={() => !isAuditor && handleOpenEdit(a)}>
                                        <Table.Cell className="font-medium">{a.company_name}</Table.Cell>
                                        <Table.Cell className="text-ui-fg-subtle">{a.rfc || "—"}</Table.Cell>
                                        <Table.Cell className="text-ui-fg-subtle">
                                            <div>{a.contact_name || "—"}</div>
                                            {a.contact_email && <div className="text-xs text-ui-fg-muted">{a.contact_email}</div>}
                                        </Table.Cell>
                                        <Table.Cell>
                                            {a.discount_percent > 0 ? (
                                                <Badge color="purple" size="small">{a.discount_percent}%</Badge>
                                            ) : <Text className="text-ui-fg-muted">0%</Text>}
                                        </Table.Cell>
                                        <Table.Cell className="text-ui-fg-subtle">{fmtMoney(a.credit_limit)}</Table.Cell>
                                        <Table.Cell className="text-ui-fg-subtle">{a.payment_terms_days} días</Table.Cell>
                                        <Table.Cell>
                                            <Badge color={a.status === "active" ? "green" : "grey"} size="small">
                                                {a.status === "active" ? "Activo" : "Inactivo"}
                                            </Badge>
                                            {isExpired(a) && <Badge color="red" size="small" className="ml-1">Vencido</Badge>}
                                        </Table.Cell>
                                        <Table.Cell className="text-ui-fg-subtle text-xs">
                                            {fmtDate(a.valid_from)} — {fmtDate(a.valid_until)}
                                        </Table.Cell>
                                        {!isAuditor && (
                                            <Table.Cell>
                                                <Button variant="secondary" size="small" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(a.id); }}>
                                                    🗑
                                                </Button>
                                            </Table.Cell>
                                        )}
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    </Container>
                )}

                {/* Delete Confirmation */}
                {deleteConfirm && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
                        <div className="bg-ui-bg-base p-6 rounded-lg shadow-lg max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
                            <Heading level="h2" className="text-ui-fg-base text-lg font-bold mb-2">Confirmar Eliminación</Heading>
                            <Text className="text-ui-fg-subtle text-sm mb-4">¿Estás seguro de que deseas eliminar este convenio? Esta acción no se puede deshacer.</Text>
                            <div className="flex justify-end gap-2">
                                <Button variant="secondary" size="small" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
                                <Button variant="danger" size="small" onClick={() => handleDelete(deleteConfirm)}>Eliminar</Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Create/Edit Modal */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
                        <div className="bg-ui-bg-base p-6 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <Heading level="h2" className="text-ui-fg-base text-lg font-bold mb-4">
                                {editingId ? "✏️ Editar Convenio" : "➕ Nuevo Convenio"}
                            </Heading>
                            <div className="flex flex-col gap-4">
                                {/* Company Name */}
                                <div>
                                    <Label htmlFor="m-company" className="text-sm font-medium">Empresa *</Label>
                                    <Input id="m-company" placeholder="Nombre de la empresa" value={form.company_name} onChange={(e) => setField("company_name", e.target.value)} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="m-rfc" className="text-sm font-medium">RFC</Label>
                                        <Input id="m-rfc" placeholder="Ej: ABC123456XY0" value={form.rfc} onChange={(e) => setField("rfc", e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="m-status" className="text-sm font-medium">Estado</Label>
                                        <Select value={form.status} onValueChange={(v) => setField("status", v)}>
                                            <Select.Trigger id="m-status"><Select.Value /></Select.Trigger>
                                            <Select.Content>
                                                <Select.Item value="active">Activo</Select.Item>
                                                <Select.Item value="inactive">Inactivo</Select.Item>
                                            </Select.Content>
                                        </Select>
                                    </div>
                                </div>
                                {/* Contact info */}
                                <div className="border-t border-ui-border-base pt-3">
                                    <Text className="text-sm font-semibold text-ui-fg-base mb-2">Datos de Contacto</Text>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label htmlFor="m-cname" className="text-xs">Nombre</Label>
                                            <Input id="m-cname" placeholder="Nombre contacto" value={form.contact_name} onChange={(e) => setField("contact_name", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label htmlFor="m-cemail" className="text-xs">Email</Label>
                                            <Input id="m-cemail" type="email" placeholder="email@empresa.com" value={form.contact_email} onChange={(e) => setField("contact_email", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label htmlFor="m-cphone" className="text-xs">Teléfono</Label>
                                            <Input id="m-cphone" placeholder="(000) 000-0000" value={form.contact_phone} onChange={(e) => setField("contact_phone", e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                {/* Financial */}
                                <div className="border-t border-ui-border-base pt-3">
                                    <Text className="text-sm font-semibold text-ui-fg-base mb-2">Condiciones Comerciales</Text>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label htmlFor="m-disc" className="text-xs">Descuento (%)</Label>
                                            <Input id="m-disc" type="number" min="0" max="100" step="0.5" value={String(form.discount_percent)} onChange={(e) => setField("discount_percent", parseFloat(e.target.value) || 0)} />
                                        </div>
                                        <div>
                                            <Label htmlFor="m-credit" className="text-xs">Límite de Crédito ($)</Label>
                                            <Input id="m-credit" type="number" min="0" step="100" value={String(form.credit_limit)} onChange={(e) => setField("credit_limit", parseFloat(e.target.value) || 0)} />
                                        </div>
                                        <div>
                                            <Label htmlFor="m-terms" className="text-xs">Plazo de Pago (días)</Label>
                                            <Input id="m-terms" type="number" min="0" value={String(form.payment_terms_days)} onChange={(e) => setField("payment_terms_days", parseInt(e.target.value) || 0)} />
                                        </div>
                                    </div>
                                </div>
                                {/* Validity */}
                                <div className="border-t border-ui-border-base pt-3">
                                    <Text className="text-sm font-semibold text-ui-fg-base mb-2">Vigencia</Text>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label htmlFor="m-vfrom" className="text-xs">Fecha de inicio</Label>
                                            <Input id="m-vfrom" type="date" value={form.valid_from} onChange={(e) => setField("valid_from", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label htmlFor="m-vuntil" className="text-xs">Fecha de fin</Label>
                                            <Input id="m-vuntil" type="date" value={form.valid_until} onChange={(e) => setField("valid_until", e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                {/* Notes */}
                                <div>
                                    <Label htmlFor="m-notes" className="text-sm font-medium">Notas</Label>
                                    <Textarea id="m-notes" placeholder="Notas adicionales del convenio..." value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
                                </div>
                                {/* Actions */}
                                <div className="flex justify-end gap-2 pt-2 border-t border-ui-border-base">
                                    <Button variant="secondary" size="base" onClick={() => setShowModal(false)}>Cancelar</Button>
                                    <Button variant="primary" size="base" onClick={handleSave} isLoading={isSaving} disabled={isSaving}>
                                        {editingId ? "Guardar Cambios" : "Crear Convenio"}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Convenios B2B",
    icon: undefined,
});

export default B2BAgreementsPage;
