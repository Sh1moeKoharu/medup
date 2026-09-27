import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Badge, Button, Container, Heading, Input, Label, Select, Table, Text, Textarea } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES, normalizeRole } from "../../../lib/roles";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

/**
 * Paquetes: varios productos (y la consulta, si se quiere) a un precio
 * cerrado, ligados a un especialista. El mismo «Nacimiento» puede existir
 * para dos especialistas con precio distinto: son dos paquetes.
 *
 * En Caja se añade entero al carrito; sus renglones entran con el precio
 * prorrateado, así que inventario, aseguranza y ticket los ven como
 * renglones normales.
 */

type Renglon = { variant_id: string; product_title: string | null; quantity: number };
type Paquete = {
    id: string; name: string; specialist_id: string | null; specialist_name: string | null;
    items: Renglon[]; includes_consultation: boolean; price: number; status: string;
    valid_from: string | null; valid_until: string | null; notes: string | null;
};
type Medico = { id: string; nombre: string };

const vacio = { name: "", specialist_id: "", price: 0, includes_consultation: true, status: "active", valid_from: "", valid_until: "", notes: "" };

const PaquetesPage = () => {
    const [lista, setLista] = useState<Paquete[]>([]);
    const [medicos, setMedicos] = useState<Medico[]>([]);
    const [cargando, setCargando] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [soloLectura, setSoloLectura] = useState(false);
    const [modal, setModal] = useState(false);
    const [editando, setEditando] = useState<string | null>(null);
    const [form, setForm] = useState(vacio);
    const [renglones, setRenglones] = useState<Renglon[]>([]);
    const [busqueda, setBusqueda] = useState("");
    const [resultados, setResultados] = useState<{ variant_id: string; product_title: string }[]>([]);
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
        fetch("/admin/staff", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : { users: [] }))
            .then((d) => setMedicos((d.users || [])
                .filter((u: any) => normalizeRole(u.metadata?.role) === ROLES.DOCTOR)
                .map((u: any) => ({ id: u.id, nombre: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email }))))
            .catch(() => {});
    }, []);

    const cargar = async () => {
        setCargando(true);
        try {
            const res = await fetch("/admin/packages");
            if (esDenegado(res)) { setDenegado(true); return; }
            if (res.ok) setLista((await res.json()).packages || []);
        } catch (e) { console.error("Error al cargar paquetes:", e); }
        finally { setCargando(false); }
    };

    useEffect(() => {
        if (busqueda.trim().length < 2) { setResultados([]); return; }
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/admin/products?q=${encodeURIComponent(busqueda.trim())}&limit=10`);
                const d = await res.json();
                const salida: { variant_id: string; product_title: string }[] = [];
                (d.products || []).forEach((p: any) => (p.variants || []).forEach((v: any) => salida.push({ variant_id: v.id, product_title: p.title + (v.title && v.title !== "Default" ? ` · ${v.title}` : "") })));
                setResultados(salida);
            } catch { setResultados([]); }
        }, 300);
        return () => clearTimeout(t);
    }, [busqueda]);

    const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(""), 3000); };
    const campo = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

    const abrirAlta = () => { setForm(vacio); setRenglones([]); setEditando(null); setError(""); setBusqueda(""); setModal(true); };
    const abrirEdicion = (p: Paquete) => {
        setForm({
            name: p.name, specialist_id: p.specialist_id || "", price: p.price, includes_consultation: p.includes_consultation, status: p.status,
            valid_from: p.valid_from ? p.valid_from.substring(0, 10) : "", valid_until: p.valid_until ? p.valid_until.substring(0, 10) : "", notes: p.notes || "",
        });
        setRenglones(Array.isArray(p.items) ? p.items : []);
        setEditando(p.id); setError(""); setBusqueda(""); setModal(true);
    };

    const agregarRenglon = (r: { variant_id: string; product_title: string }) => {
        if (renglones.some((x) => x.variant_id === r.variant_id)) return;
        setRenglones([...renglones, { variant_id: r.variant_id, product_title: r.product_title, quantity: 1 }]);
        setBusqueda(""); setResultados([]);
    };

    const guardar = async () => {
        setGuardando(true); setError("");
        try {
            const medico = medicos.find((m) => m.id === form.specialist_id);
            const res = await fetch(editando ? `/admin/packages/${editando}` : "/admin/packages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form, price: Number(form.price), items: renglones,
                    specialist_id: form.specialist_id || null, specialist_name: medico?.nombre || null,
                    valid_from: form.valid_from || null, valid_until: form.valid_until || null,
                }),
            });
            if (res.ok) { setModal(false); avisar(editando ? "Paquete corregido." : "Paquete dado de alta. Caja ya puede añadirlo al carrito."); cargar(); }
            else setError((await res.json()).error || "No se pudo guardar.");
        } catch { setError("Error de conexión."); }
        finally { setGuardando(false); }
    };

    const retirar = async (id: string) => {
        try {
            const res = await fetch(`/admin/packages/${id}`, { method: "DELETE" });
            if (res.ok) { setConfirmarBaja(null); avisar("Paquete retirado. Los cobros anteriores no cambian."); cargar(); }
        } catch { alert("No se pudo retirar."); }
    };

    const dinero = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
    const vencido = (p: Paquete) => p.valid_until && new Date(p.valid_until) < new Date();

    if (denegado) return <SinAcceso recurso="los paquetes" />;

    return (
        <Container className="p-8">
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <Heading level="h1" className="text-ui-fg-base text-2xl font-bold">Paquetes</Heading>
                        <Text className="text-ui-fg-subtle text-sm mt-1">
                            Varios productos, y la consulta si se quiere, a un precio cerrado por especialista. Caja lo añade entero al carrito.
                        </Text>
                    </div>
                    {!soloLectura && <Button variant="primary" size="base" onClick={abrirAlta}>+ Nuevo paquete</Button>}
                </div>

                {aviso && (
                    <div className="flex items-center gap-2 p-3 bg-ui-tag-green-bg rounded-md border border-ui-tag-green-border">
                        <Text className="text-ui-tag-green-text text-sm font-medium">{aviso}</Text>
                    </div>
                )}

                {cargando ? (
                    <Text className="text-ui-fg-subtle py-8">Cargando paquetes…</Text>
                ) : lista.length === 0 ? (
                    <Container className="p-8 text-center">
                        <Text className="text-ui-fg-muted text-lg">No hay paquetes. Da de alta el primero: nombre, especialista, qué incluye y su precio.</Text>
                    </Container>
                ) : (
                    <Container className="p-0 rounded-lg border border-ui-border-base overflow-hidden">
                        <div style={{ overflowX: "auto", width: "100%" }}>
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.HeaderCell>Paquete</Table.HeaderCell>
                                        <Table.HeaderCell>Especialista</Table.HeaderCell>
                                        <Table.HeaderCell>Incluye</Table.HeaderCell>
                                        <Table.HeaderCell>Precio</Table.HeaderCell>
                                        <Table.HeaderCell>Estado</Table.HeaderCell>
                                        {!soloLectura && <Table.HeaderCell></Table.HeaderCell>}
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {lista.map((p) => (
                                        <Table.Row key={p.id}>
                                            <Table.Cell><Text className="font-medium">{p.name}</Text>{p.notes && <Text className="text-ui-fg-subtle text-xs">{p.notes}</Text>}</Table.Cell>
                                            <Table.Cell>{p.specialist_name || "—"}</Table.Cell>
                                            <Table.Cell>
                                                <Text className="text-sm">
                                                    {[...(p.items || []).map((r) => `${r.quantity} × ${r.product_title || r.variant_id}`), ...(p.includes_consultation ? ["Consulta"] : [])].join(" · ")}
                                                </Text>
                                            </Table.Cell>
                                            <Table.Cell>{dinero(p.price)}</Table.Cell>
                                            <Table.Cell>
                                                {p.status !== "active" ? <Badge color="grey">Inactivo</Badge> : vencido(p) ? <Badge color="orange">Vencido</Badge> : <Badge color="green">Activo</Badge>}
                                            </Table.Cell>
                                            {!soloLectura && (
                                                <Table.Cell>
                                                    <div className="flex gap-2 justify-end">
                                                        <Button variant="secondary" size="small" onClick={() => abrirEdicion(p)}>Corregir</Button>
                                                        {confirmarBaja === p.id ? (
                                                            <>
                                                                <Button variant="danger" size="small" onClick={() => retirar(p.id)}>Sí, retirar</Button>
                                                                <Button variant="transparent" size="small" onClick={() => setConfirmarBaja(null)}>No</Button>
                                                            </>
                                                        ) : (
                                                            <Button variant="transparent" size="small" onClick={() => setConfirmarBaja(p.id)}>Retirar</Button>
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto" onClick={() => !guardando && setModal(false)}>
                        <div className="bg-ui-bg-base rounded-lg p-6 w-full max-w-2xl shadow-xl my-8" onClick={(e) => e.stopPropagation()}>
                            <Heading level="h2" className="text-xl font-bold mb-4">{editando ? "Corregir paquete" : "Nuevo paquete"}</Heading>
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label htmlFor="paq-nombre">Nombre</Label>
                                        <Input id="paq-nombre" placeholder="Ej: Nacimiento, Control prenatal" value={form.name} onChange={(e) => campo("name", e.target.value)} />
                                    </div>
                                    <div>
                                        <Label>Especialista</Label>
                                        <Select value={form.specialist_id || "__ninguno__"} onValueChange={(v) => campo("specialist_id", v === "__ninguno__" ? "" : v)}>
                                            <Select.Trigger><Select.Value placeholder="Cualquiera" /></Select.Trigger>
                                            <Select.Content>
                                                <Select.Item value="__ninguno__">Cualquiera</Select.Item>
                                                {medicos.map((m) => <Select.Item key={m.id} value={m.id}>{m.nombre}</Select.Item>)}
                                            </Select.Content>
                                        </Select>
                                    </div>
                                </div>

                                <div>
                                    <Label htmlFor="paq-buscar">Qué incluye</Label>
                                    <Input id="paq-buscar" placeholder="Busca un producto por nombre…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                                    {resultados.length > 0 && (
                                        <div className="mt-1 border border-ui-border-base rounded-md max-h-40 overflow-y-auto">
                                            {resultados.map((r) => (
                                                <button key={r.variant_id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-ui-bg-subtle" onClick={() => agregarRenglon(r)}>
                                                    {r.product_title}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-2 flex flex-col gap-2">
                                        {renglones.map((r, i) => (
                                            <div key={r.variant_id} className="flex items-center gap-3">
                                                <Input
                                                    type="number" min={1} className="w-20"
                                                    value={r.quantity}
                                                    onChange={(e) => setRenglones(renglones.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                                                />
                                                <Text className="text-sm flex-1">{r.product_title || r.variant_id}</Text>
                                                <Button variant="transparent" size="small" onClick={() => setRenglones(renglones.filter((_, j) => j !== i))}>Quitar</Button>
                                            </div>
                                        ))}
                                        <label className="flex items-center gap-2 text-sm text-ui-fg-base">
                                            <input type="checkbox" checked={form.includes_consultation} onChange={(e) => campo("includes_consultation", e.target.checked)} />
                                            Incluye la consulta
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <Label htmlFor="paq-precio">Precio cerrado</Label>
                                        <Input id="paq-precio" type="number" min={1} value={form.price} onChange={(e) => campo("price", e.target.value)} />
                                        <Text className="text-ui-fg-muted text-xs mt-1">Se reparte entre los renglones según su precio de lista. Si la Consulta no tiene precio de referencia, en el paquete sale en $0 (incluida).</Text>
                                    </div>
                                    <div>
                                        <Label htmlFor="paq-desde">Vigente desde</Label>
                                        <Input id="paq-desde" type="date" value={form.valid_from} onChange={(e) => campo("valid_from", e.target.value)} />
                                    </div>
                                    <div>
                                        <Label htmlFor="paq-hasta">Hasta</Label>
                                        <Input id="paq-hasta" type="date" value={form.valid_until} onChange={(e) => campo("valid_until", e.target.value)} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Estado</Label>
                                        <Select value={form.status} onValueChange={(v) => campo("status", v)}>
                                            <Select.Trigger><Select.Value /></Select.Trigger>
                                            <Select.Content>
                                                <Select.Item value="active">Activo</Select.Item>
                                                <Select.Item value="inactive">Inactivo</Select.Item>
                                            </Select.Content>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label htmlFor="paq-notas">Notas</Label>
                                        <Textarea id="paq-notas" rows={2} value={form.notes} onChange={(e) => campo("notes", e.target.value)} placeholder="Requisitos, lo que Caja deba saber" />
                                    </div>
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
    label: "Paquetes",
    icon: undefined,
});

export default PaquetesPage;
