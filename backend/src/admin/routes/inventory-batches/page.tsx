import { Container, Heading, Text, Table, Badge, Select } from "@medusajs/ui";
import { useEffect, useState } from "react";

/**
 * ⚠️ ARROW FUNCTION OBLIGATORIA.
 *
 * Antes era `export default function InventoryBatchesPage()`. La documentación
 * de Medusa lo prohíbe de forma explícita: "Widget and UI routes must be
 * defined as arrow functions. Any other type of declaration isn't accepted".
 *
 * El plugin que descubre las extensiones analiza el archivo buscando una
 * función flecha; con una declaración de función no la reconoce y la pantalla
 * no llega a registrarse.
 *
 * ── POR ALMACÉN ─────────────────────────────────────────────────────────────
 * Cada lote pertenece a un almacén (Farmacia o Enfermería). La lista se puede
 * filtrar por uno, y cada fila dice en cuál está: la caducidad más próxima se
 * decide dentro del almacén, no entre los dos.
 */
const InventoryBatchesPage = () => {
    const [batches, setBatches] = useState<any[]>([]);
    const [almacenes, setAlmacenes] = useState<{ id: string; name: string }[]>([]);
    const [almacen, setAlmacen] = useState<string>("todos");
    const [loading, setLoading] = useState(true);
    const [denegado, setDenegado] = useState(false);

    useEffect(() => {
        fetch("/admin/stock-locations?fields=id,name&limit=50", { credentials: "include" })
            .then((res) => res.json())
            .then((data) => setAlmacenes(data.stock_locations ?? []))
            .catch((err) => console.error("Error fetching stock locations:", err));
    }, []);

    useEffect(() => {
        setLoading(true);
        const filtro = almacen === "todos" ? "" : `?stock_location_id=${encodeURIComponent(almacen)}`;
        // Obtenemos los lotes desde nuestro nuevo endpoint API
        fetch(`/admin/medical-batches${filtro}`, { credentials: "include" })
            .then(res => { if (esDenegado(res)) { setDenegado(true); return {} as any; } return res.json(); })
            .then(data => {
                if (data.batches) {
                    // Ordenamos por caducidad (el mas cercano primero)
                    const sorted = data.batches.sort((a: any, b: any) => new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime());
                    setBatches(sorted);
                }
            })
            .catch(err => console.error("Error fetching batches:", err))
            .finally(() => setLoading(false));
    }, [almacen]);

    if (denegado) return <SinAcceso recurso="los lotes" />;

    return (
        <Container className="p-8">
            <Heading level="h1" className="mb-4 text-ui-fg-base">
                Lotes y caducidades
            </Heading>
            <Text className="text-ui-fg-subtle mb-6">
                Todos los lotes dados de alta, con su almacén y su caducidad. El sistema FEFO descuenta primero, dentro de cada almacén, el que caduca antes: los que aparecen arriba.
            </Text>

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

            {loading ? (
                <Text>Cargando datos de lotes...</Text>
            ) : batches.length === 0 ? (
                <Text>No hay lotes registrados todavía. Comienza a darlos de alta desde los productos.</Text>
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
                            <Table.HeaderCell>Estado</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {batches.map(batch => {
                            const expDate = new Date(batch.expiration_date);
                            const now = new Date();
                            const isExpired = expDate < now;
                            const isClose = (expDate.getTime() - now.getTime()) < 30 * 24 * 60 * 60 * 1000;

                            return (
                                <Table.Row key={batch.id}>
                                    <Table.Cell className="font-semibold text-ui-fg-base">
                                        {batch.batch_number}
                                    </Table.Cell>
                                    <Table.Cell>
                                        {batch.stock_location_name ?? <span className="text-ui-fg-error">sin almacén</span>}
                                    </Table.Cell>
                                    <Table.Cell className="text-ui-fg-muted">
                                        {batch.variant_title
                                            ? sinVarianteUnica(batch.variant_title)
                                            : batch.product_variant?.title || "Presentación retirada del catálogo"}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge color={batch.quantity <= 0 ? "red" : "green"}>
                                            {batch.quantity}{batch.sale_unit ? ` ${batch.sale_unit}` : ""}
                                        </Badge>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {expDate.toLocaleDateString()}
                                    </Table.Cell>
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
                                </Table.Row>
                            );
                        })}
                    </Table.Body>
                </Table>
                </div>
            )}
        </Container>
    );
}

export default InventoryBatchesPage;

// Configuración para inyectar en la sidebar del admin
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { sinVarianteUnica } from "../../lib/titulos";
import { DocumentText } from "@medusajs/icons";
import { SinAcceso, esDenegado } from "../../lib/sin-acceso";

export const config = defineRouteConfig({
    label: "Lotes FEFO",
    icon: DocumentText,
});
