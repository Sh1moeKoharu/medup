import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";
import { Badge, Button, Container, Heading, Input, Select, Table, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { ROLES } from "../../../lib/roles";
import { BuscadorDeProducto, CuadroDeMotivo, Lote, PresentacionElegida, aDia, enviar } from "../../lib/motivo";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";
import { sinVarianteUnica } from "../../lib/titulos";
import { useCurrentRole } from "../../lib/use-current-role";

/**
 * ⚠️ ARROW FUNCTION OBLIGATORIA.
 *
 * Antes era `export default function InventoryBatchesPage()`. La documentación
 * de Medusa lo prohíbe de forma explícita: "Widget and UI routes must be
 * defined as arrow functions. Any other type of declaration isn't accepted".
 *
 * ── POR ALMACÉN ─────────────────────────────────────────────────────────────
 * Cada lote pertenece a un almacén (Farmacia o Enfermería). La lista se puede
 * filtrar por uno, y cada fila dice en cuál está: la caducidad más próxima se
 * decide dentro del almacén, no entre los dos.
 *
 * ── LO QUE SE HACE DESDE AQUÍ ───────────────────────────────────────────────
 *   Alta de lote   la compra que llegó: presentación, almacén, lote, caducidad,
 *                  cantidad y costo. Entra al kardex como compra.
 *   Corregir       número, caducidad o estante mal capturados, con motivo. La
 *                  cantidad no se corrige aquí.
 *   Conteo         la existencia real contada; la diferencia entra al kardex
 *                  como ajuste con responsable.
 *   Baja           lo que se rompió, se contaminó o no aparece, con motivo.
 * La destrucción sanitaria de lo caducado sigue en la ficha del producto.
 */

type Almacen = { id: string; name: string };

const AltaDeLote = ({ almacenes, onCreado, onCerrar }: { almacenes: Almacen[]; onCreado: () => void; onCerrar: () => void }) => {
    const [presentacion, setPresentacion] = useState<PresentacionElegida | null>(null);
    const [almacen, setAlmacen] = useState(almacenes[0]?.id ?? "");
    const [lote, setLote] = useState("");
    const [caducidad, setCaducidad] = useState("");
    const [cantidad, setCantidad] = useState("");
    const [costo, setCosto] = useState("");
    const [estante, setEstante] = useState("");
    const [guardando, setGuardando] = useState(false);

    const guardar = async () => {
        if (!presentacion) return alert("Elige la presentación.");
        if (!lote.trim() || !caducidad) return alert("El número de lote y la caducidad son obligatorios.");
        const n = Number(cantidad);
        if (!Number.isInteger(n) || n <= 0) return alert("La cantidad debe ser un entero mayor que 0.");
        setGuardando(true);
        const { error } = await enviar("/admin/medical-batches", {
            variant_id: presentacion.variant_id,
            stock_location_id: almacen || undefined,
            batch_number: lote.trim(),
            expiration_date: caducidad,
            quantity: n,
            unit_cost: costo === "" ? undefined : Number(costo),
            apply_margin: false,
            shelf_location: estante.trim() || undefined,
            entry_type: "entry_purchase",
        });
        setGuardando(false);
        if (error) return alert(error);
        onCreado();
    };

    return (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
            <Heading level="h2">Alta de lote</Heading>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Presentación</Text>
                    {presentacion ? (
                        <div className="flex items-center gap-2">
                            <Text>{presentacion.title}</Text>
                            <Button size="small" variant="transparent" onClick={() => setPresentacion(null)}>Cambiar</Button>
                        </div>
                    ) : (
                        <BuscadorDeProducto onElegir={setPresentacion} />
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Almacén</Text>
                    <Select value={almacen} onValueChange={setAlmacen}>
                        <Select.Trigger><Select.Value placeholder="Elige el almacén" /></Select.Trigger>
                        <Select.Content>
                            {almacenes.map((a) => <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>)}
                        </Select.Content>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Número de lote</Text>
                    <Input value={lote} onChange={(e) => setLote(e.target.value)} placeholder="Como viene en la caja" />
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Caducidad</Text>
                    <Input type="date" value={caducidad} onChange={(e) => setCaducidad(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Cantidad (unidades de venta)</Text>
                    <Input type="number" min="1" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Costo por unidad</Text>
                    <Input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Opcional; entra a la valuación" />
                </div>
                <div className="flex flex-col gap-1">
                    <Text size="small" weight="plus">Estante</Text>
                    <Input value={estante} onChange={(e) => setEstante(e.target.value)} placeholder="Ej. B-2" />
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
                <Button onClick={guardar} isLoading={guardando}>Registrar lote</Button>
            </div>
        </div>
    );
};

type Accion = { tipo: "corregir" | "conteo" | "baja"; lote: Lote };

const InventoryBatchesPage = () => {
    const { role } = useCurrentRole();
    const puedeEditar = role === ROLES.ADMIN || role === ROLES.WAREHOUSE;
    const [batches, setBatches] = useState<Lote[]>([]);
    const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
    const [almacen, setAlmacen] = useState<string>("todos");
    const [loading, setLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);
    const [creando, setCreando] = useState(false);
    // Los lotes agotados se quedan en la base (su kardex sigue ahí); a la vista
    // sólo estorban, así que se ocultan salvo que se pidan.
    const [conAgotados, setConAgotados] = useState(false);
    const [accion, setAccion] = useState<Accion | null>(null);
    const [enviando, setEnviando] = useState(false);
    // Campos de la acción abierta: número/caducidad/estante para corregir,
    // cantidad para conteo y baja.
    const [campos, setCampos] = useState<{ lote: string; caducidad: string; estante: string; cantidad: string }>({ lote: "", caducidad: "", estante: "", cantidad: "" });

    useEffect(() => {
        fetch("/admin/stock-locations?fields=id,name&limit=50", { credentials: "include" })
            .then((res) => res.json())
            .then((data) => setAlmacenes(data.stock_locations ?? []))
            .catch((err) => console.error("Error fetching stock locations:", err));
    }, []);

    const cargar = () => {
        setLoading(true);
        const filtro = almacen === "todos" ? "" : `?stock_location_id=${encodeURIComponent(almacen)}`;
        fetch(`/admin/medical-batches${filtro}`, { credentials: "include" })
            .then((res) => { if (esDenegado(res)) { setDenegado(true); return {} as any; } return res.json(); })
            .then((data) => {
                if (data.batches) {
                    // Por caducidad, la más próxima primero: es el orden en que FEFO descuenta.
                    setBatches([...data.batches].sort((a: Lote, b: Lote) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime()));
                }
            })
            .catch((err) => console.error("Error fetching batches:", err))
            .finally(() => setLoading(false));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(cargar, [almacen]);

    const abrir = (tipo: Accion["tipo"], lote: Lote) => {
        setAccion({ tipo, lote });
        setCampos({ lote: lote.batch_number, caducidad: aDia(lote.expiration_date), estante: lote.shelf_location ?? "", cantidad: tipo === "conteo" ? String(lote.quantity) : "" });
    };

    const confirmar = async (motivo: string) => {
        if (!accion) return;
        const { tipo, lote } = accion;
        setEnviando(true);
        let error: string | null = null;
        if (tipo === "corregir") {
            ({ error } = await enviar(`/admin/medical-batches/${lote.id}`, { batch_number: campos.lote, expiration_date: campos.caducidad, shelf_location: campos.estante, motivo }));
        } else if (tipo === "baja") {
            ({ error } = await enviar(`/admin/medical-batches/${lote.id}/write-off`, { quantity: Number(campos.cantidad), reason: motivo }));
        } else {
            const r = await enviar("/admin/inventory-counts", { counts: [{ batch_id: lote.id, counted_quantity: Number(campos.cantidad) }], apply: true, notes: motivo });
            error = r.error;
            if (!error) {
                const d = (r.data.differences ?? [])[0];
                alert(d ? `Conteo aplicado: el lote ${lote.batch_number} pasa de ${d.system_quantity ?? lote.quantity} a ${d.counted_quantity ?? campos.cantidad}. Quedó en el kardex.` : `Conteo registrado: el lote ${lote.batch_number} coincide con el sistema.`);
            }
        }
        setEnviando(false);
        if (error) return alert(error);
        setAccion(null);
        cargar();
    };

    if (denegado) return <SinAcceso recurso="los lotes" />;

    const titulos: Record<Accion["tipo"], string> = { corregir: "Corregir los datos del lote", conteo: "Conteo físico", baja: "Dar de baja" };

    return (
        <Container className="p-8">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Heading level="h1" className="text-ui-fg-base">Lotes y caducidades</Heading>
                    <Text className="text-ui-fg-subtle">
                        Todos los lotes dados de alta, con su almacén y su caducidad. El sistema FEFO descuenta primero, dentro de cada almacén, el que caduca antes: los que aparecen arriba.
                    </Text>
                </div>
                {puedeEditar && !creando && <Button onClick={() => setCreando(true)}>Alta de lote</Button>}
            </div>

            {creando && <AltaDeLote almacenes={almacenes} onCerrar={() => setCreando(false)} onCreado={() => { setCreando(false); cargar(); }} />}

            <div style={{ maxWidth: 320, marginBottom: 24 }}>
                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>Almacén</Text>
                <Select value={almacen} onValueChange={setAlmacen}>
                    <Select.Trigger>
                        <Select.Value placeholder="Todos los almacenes" />
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value="todos">Todos los almacenes</Select.Item>
                        {almacenes.map((a) => (
                            <Select.Item key={a.id} value={a.id}>{a.name}</Select.Item>
                        ))}
                    </Select.Content>
                </Select>
            </div>

            <label className="mb-4 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conAgotados} onChange={(e) => setConAgotados(e.target.checked)} />
                Mostrar también los lotes agotados ({batches.filter((b) => b.status === "active" && Number(b.quantity) <= 0).length})
            </label>

            {loading ? (
                <Text>Cargando datos de lotes...</Text>
            ) : batches.length === 0 ? (
                <Text>No hay lotes registrados todavía. Comienza a darlos de alta con «Alta de lote».</Text>
            ) : (
                <div style={{ overflowX: "auto", width: "100%" }}>
                    {/* Scroll horizontal: la tabla es mas ancha que una tableta en vertical y,
                        sin este contenedor, las columnas de la derecha se recortan sin manera
                        de llegar a ellas. */}
                    <Table>
                        <Table.Header>
                            <Table.Row>
                                <Table.HeaderCell>Lote</Table.HeaderCell>
                                <Table.HeaderCell>Almacén</Table.HeaderCell>
                                <Table.HeaderCell>Presentación</Table.HeaderCell>
                                <Table.HeaderCell>Existencia</Table.HeaderCell>
                                <Table.HeaderCell>Caducidad</Table.HeaderCell>
                                <Table.HeaderCell>Estante</Table.HeaderCell>
                                <Table.HeaderCell>Estado</Table.HeaderCell>
                                {puedeEditar && <Table.HeaderCell></Table.HeaderCell>}
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {batches.filter((b) => conAgotados || b.status !== "active" || Number(b.quantity) > 0).map((batch) => {
                                const expDate = new Date(batch.expiration_date);
                                const now = new Date();
                                const isExpired = expDate < now;
                                const isClose = expDate.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000;
                                const abierta = accion?.lote.id === batch.id;
                                return (
                                    <>
                                        <Table.Row key={batch.id}>
                                            <Table.Cell className="font-semibold text-ui-fg-base">{batch.batch_number}</Table.Cell>
                                            <Table.Cell>{batch.stock_location_name ?? <span className="text-ui-fg-error">sin almacén</span>}</Table.Cell>
                                            <Table.Cell className="text-ui-fg-muted">
                                                {batch.variant_title ? sinVarianteUnica(batch.variant_title) : (batch as any).product_variant?.title || "Presentación retirada del catálogo"}
                                            </Table.Cell>
                                            <Table.Cell>
                                                <Badge color={batch.quantity <= 0 ? "red" : "green"}>
                                                    {batch.quantity}{batch.sale_unit ? ` ${batch.sale_unit}` : ""}
                                                </Badge>
                                            </Table.Cell>
                                            <Table.Cell>{expDate.toLocaleDateString()}</Table.Cell>
                                            <Table.Cell>{batch.shelf_location ?? "—"}</Table.Cell>
                                            <Table.Cell>
                                                {batch.status === "destroyed" ? (
                                                    <Badge color="grey">Destruido</Badge>
                                                ) : batch.status === "quarantined" ? (
                                                    <Badge color="red">En cuarentena</Badge>
                                                ) : isExpired ? (
                                                    <Badge color="red">Caducado</Badge>
                                                ) : isClose ? (
                                                    <Badge color="orange">Próximo</Badge>
                                                ) : (
                                                    <Badge color="green">Vigente</Badge>
                                                )}
                                            </Table.Cell>
                                            {puedeEditar && (
                                                <Table.Cell>
                                                    {batch.status === "active" && !abierta && (
                                                        <div className="flex gap-1">
                                                            <Button size="small" variant="secondary" onClick={() => abrir("corregir", batch)}>Corregir</Button>
                                                            <Button size="small" variant="secondary" onClick={() => abrir("conteo", batch)}>Conteo</Button>
                                                            {batch.quantity > 0 && <Button size="small" variant="danger" onClick={() => abrir("baja", batch)}>Baja</Button>}
                                                        </div>
                                                    )}
                                                    {batch.status === "quarantined" && <Text size="xsmall" className="text-ui-fg-muted">Se destruye desde la ficha del producto</Text>}
                                                </Table.Cell>
                                            )}
                                        </Table.Row>
                                        {abierta && accion && (
                                            <Table.Row key={`${batch.id}-accion`}>
                                                {/* @ts-ignore */}
                                                <Table.Cell colSpan={8}>
                                                    <CuadroDeMotivo
                                                        titulo={`${titulos[accion.tipo]} · ${batch.batch_number}`}
                                                        descripcion={
                                                            accion.tipo === "corregir"
                                                                ? "Cambiar la caducidad cambia el orden en que se descuenta. La cantidad se corrige con un conteo."
                                                                : accion.tipo === "conteo"
                                                                  ? `El sistema dice ${batch.quantity}. Escribe lo que contaste; la diferencia queda en el kardex como ajuste a tu nombre.`
                                                                  : "Sale del inventario con su motivo y Administración recibe el aviso. No se deshace."
                                                        }
                                                        etiqueta={accion.tipo === "corregir" ? "Guardar corrección" : accion.tipo === "conteo" ? "Aplicar conteo" : "Dar de baja"}
                                                        enviando={enviando}
                                                        onCancelar={() => setAccion(null)}
                                                        onConfirmar={confirmar}
                                                    >
                                                        {accion.tipo === "corregir" ? (
                                                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                                                <div><Text size="xsmall">Número de lote</Text><Input value={campos.lote} onChange={(e) => setCampos({ ...campos, lote: e.target.value })} /></div>
                                                                <div><Text size="xsmall">Caducidad</Text><Input type="date" value={campos.caducidad} onChange={(e) => setCampos({ ...campos, caducidad: e.target.value })} /></div>
                                                                <div><Text size="xsmall">Estante</Text><Input value={campos.estante} onChange={(e) => setCampos({ ...campos, estante: e.target.value })} /></div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ maxWidth: 220 }}>
                                                                <Text size="xsmall">{accion.tipo === "conteo" ? "Cantidad contada" : "Cantidad a dar de baja"}</Text>
                                                                <Input type="number" min="0" step="1" value={campos.cantidad} onChange={(e) => setCampos({ ...campos, cantidad: e.target.value })} />
                                                            </div>
                                                        )}
                                                    </CuadroDeMotivo>
                                                </Table.Cell>
                                            </Table.Row>
                                        )}
                                    </>
                                );
                            })}
                        </Table.Body>
                    </Table>
                </div>
            )}
        </Container>
    );
};

export default InventoryBatchesPage;

export const config = defineRouteConfig({
    label: "Lotes FEFO",
    icon: DocumentText,
});
