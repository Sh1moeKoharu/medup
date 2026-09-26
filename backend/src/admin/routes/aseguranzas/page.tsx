import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, Textarea } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES, normalizeRole } from "../../../lib/roles";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Aseguranzas: quién paga parte de los medicamentos del paciente y cuánto.
 *
 * El descuento se aplica solo al cobrar, únicamente a los productos de tipo
 * Medicamento, y es obligatorio: Caja no lo quita ni lo cambia. Aquí se da de
 * alta el catálogo; a cada paciente se le marcan las suyas en su ficha.
 */

type Aseguranza = {
    id: string; name: string; discount_percent: number; status: string;
    valid_from: string | null; valid_until: string | null; notes: string | null; promotion_code: string | null;
};

const vacio = { name: "", discount_percent: 10, status: "active", valid_from: "", valid_until: "", notes: "" };

const AseguranzasPage = () => {
    const [lista, setLista] = useState<Aseguranza[]>([]);
    const [cargando, setCargando] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [soloLectura, setSoloLectura] = useState(false);
    const [modal, setModal] = useState(false);
    const [editando, setEditando] = useState<string | null>(null);
    const [form, setForm] = useState(vacio);
    const [guardando, setGuardando] = useState(false);
    const [confirmarBaja, setConfirmarBaja] = useState<string | null>(null);
    const [aviso, setAviso] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        cargar();
        fetch("/admin/users/me", { credentials: "include" })
            .then((r) => r.json())
            .then((d) => { if (normalizeRole(d.user?.metadata?.role) !== ROLES.ADMIN) setSoloLectura(true); })
            .catch(() => {});
    }, []);

    const cargar = async () => {
        setCargando(true);
        try {
            const res = await fetch("/admin/insurances");
            if (esDenegado(res)) { setDenegado(true); return; }
            if (res.ok) setLista((await res.json()).insurances || []);
        } catch (e) { console.error("Error al cargar aseguranzas:", e); }
        finally { setCargando(false); }
    };

    const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(""), 3000); };
    const campo = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

    const abrirAlta = () => { setForm(vacio); setEditando(null); setError(""); setModal(true); };
    const abrirEdicion = (a: Aseguranza) => {
        setForm({
            name: a.name, discount_percent: a.discount_percent, status: a.status,
            valid_from: a.valid_from ? a.valid_from.substring(0, 10) : "",
            valid_until: a.valid_until ? a.valid_until.substring(0, 10) : "",
            notes: a.notes || "",
        });
        setEditando(a.id); setError(""); setModal(true);
    };

    const guardar = async () => {
        setGuardando(true); setError("");
        try {
            const res = await fetch(editando ? `/admin/insurances/${editando}` : "/admin/insurances", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form, discount_percent: Number(form.discount_percent), valid_from: form.valid_from || null, valid_until: form.valid_until || null }),
            });
            if (res.ok) {
                setModal(false);
                avisar(editando ? "Aseguranza corregida." : "Aseguranza dada de alta. Ya se puede marcar en la ficha de los pacientes.");
                cargar();
            } else {
                setError((await res.json()).error || "No se pudo guardar.");
            }
        } catch { setError("Error de conexión."); }
        finally { setGuardando(false); }
    };

    const dar_de_baja = async (id: string) => {
        try {
            const res = await fetch(`/admin/insurances/${id}`, { method: "DELETE" });
            if (res.ok) { setConfirmarBaja(null); avisar("Aseguranza retirada. Los cobros anteriores no cambian."); cargar(); }
        } catch { alert("No se pudo retirar."); }
    };

    const fecha = (d: string | null) => (d ? new Date(d).toLocaleDateString("es-MX") : "—");
    const vencida = (a: Aseguranza) => a.valid_until && new Date(a.valid_until) < new Date();

    if (denegado) return <SinAcceso recurso="las aseguranzas" />;

    return (
        <Container className="p-8">
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Heading level="h1" className="text-ui-fg-base text-2xl font-bold">Aseguranzas</Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-1">
                            Descuento sobre medicamentos, obligatorio y automático al cobrar. La consulta y los insumos van íntegros.
                        </Text>
                    </div>
                    {!soloLectura && <Button variant="primary" size="base" onClick={abrirAlta}>+ Nueva aseguranza</Button>}
                </div>

                {aviso && (
                    <div className="flex items-center gap-2 p-3 bg-ui-tag-green-bg rounded-md border border-ui-tag-green-border">
                        <Text className="text-ui-tag-green-text text-sm font-medium">{aviso}</Text>
                    </div>
                )}

                {cargando ? (
                    <Text className="text-ui-fg-subtle py-8">Cargando aseguranzas…</Text>
                ) : lista.length === 0 ? (
                    <Container className="p-8 text-center">
                        <Text className="text-ui-fg-muted text-lg">No hay aseguranzas. Da de alta la primera; después se marca en la ficha de cada paciente.</Text>
                    </Container>
                ) : (
                    <Container className="p-0 rounded-lg border border-ui-border-base overflow-hidden">
                        <div style={{ overflowX: "auto", width: "100%" }}>
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Aseguranza</Table.HeaderCell>
                                        <Table.HeaderCell>Descuento en medicamentos</Table.HeaderCell>
                                        <Table.HeaderCell>Vigencia</Table.HeaderCell>
                                        <Table.HeaderCell>Estado</Table.HeaderCell>
                                        <Table.HeaderCell>Notas</Table.HeaderCell>
                                        {!soloLectura && <Table.HeaderCell></Table.HeaderCell>}
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {lista.map((a) => (
                                        <Table.Row key={a.id}>
                                            <Table.Cell><Text className="font-medium">{a.name}</Text></Table.Cell>
                                            <Table.Cell>{a.discount_percent} %</Table.Cell>
                                            <Table.Cell>{a.valid_from || a.valid_until ? `${fecha(a.valid_from)} → ${fecha(a.valid_until)}` : "Sin límite"}</Table.Cell>
                                            <Table.Cell>
                                                {a.status !== "active" ? <Badge color="grey">Inactiva</Badge> : vencida(a) ? <Badge color="orange">Vencida</Badge> : <Badge color="green">Activa</Badge>}
                                            </Table.Cell>
                                            <Table.Cell><Text className="text-ui-fg-subtle text-sm">{a.notes || "—"}</Text></Table.Cell>
                                            {!soloLectura && (
                                                <Table.Cell>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="secondary" size="small" onClick={() => abrirEdicion(a)}>Corregir</Button>
                                                        {confirmarBaja === a.id ? (
                                                            <>
                                                                <Button variant="danger" size="small" onClick={() => dar_de_baja(a.id)}>Sí, retirar</Button>
                                                                <Button variant="transparent" size="small" onClick={() => setConfirmarBaja(null)}>No</Button>
                                                            </>
                                                        ) : (
                                                            <Button variant="transparent" size="small" onClick={() => setConfirmarBaja(a.id)}>Retirar</Button>
                                                        )}
                                                    </div>
                                                </Table.Cell>
                                            )}
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        </div>
                    </Container>
                )}

                {modal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !guardando && setModal(false)}>
                        <div className="bg-ui-bg-base rounded-lg p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
                            <Heading level="h2" className="text-xl font-bold mb-4">{editando ? "Corregir aseguranza" : "Nueva aseguranza"}</Heading>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <Label htmlFor="aseg-nombre">Nombre</Label>
                                    <Input id="aseg-nombre" placeholder="Ej: GNP, AXA, MetLife" value={form.name} onChange={(e) => campo("name", e.target.value)} />
                                </div>
                                <div>
                                    <Label htmlFor="aseg-pct">Descuento en medicamentos (%)</Label>
                                    <Input id="aseg-pct" type="number" min={1} max={100} value={form.discount_percent} onChange={(e) => campo("discount_percent", e.target.value)} />
                                    <Text className="text-ui-fg-muted text-xs mt-1">Sólo a productos de tipo Medicamento. La consulta y los insumos no.</Text>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="aseg-desde">Vigente desde</Label>
                                        <Input id="aseg-desde" type="date" value={form.valid_from} onChange={(e) => campo("valid_from", e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="aseg-hasta">Hasta</Label>
                                        <Input id="aseg-hasta" type="date" value={form.valid_until} onChange={(e) => campo("valid_until", e.target.value)} />
                                    </div>
                                </div>
                                <div>
                                    <Label>Estado</Label>
                                    <Select value={form.status} onValueChange={(v) => campo("status", v)}>
                                        <Select.Trigger><Select.Value /></Select.Trigger>
                                        <Select.Content>
                                            <Select.Item value="active">Activa</Select.Item>
                                            <Select.Item value="inactive">Inactiva</Select.Item>
                                        </Select.Content>
                                    </Select>
                                </div>
                                <div>
                                    <Label htmlFor="aseg-notas">Notas</Label>
                                    <Textarea id="aseg-notas" rows={2} value={form.notes} onChange={(e) => campo("notes", e.target.value)} placeholder="Condiciones, contacto, lo que Caja deba saber" />
                                </div>
                                {error && <Text className="text-ui-fg-error text-sm">{error}</Text>}
                                <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="secondary" onClick={() => setModal(false)} disabled={guardando}>Cancelar</Button>
                                    <Button variant="primary" onClick={guardar} isLoading={guardando}>{editando ? "Guardar" : "Dar de alta"}</Button>
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
    label: "Aseguranzas",
    icon: undefined,
});

export default AseguranzasPage;
