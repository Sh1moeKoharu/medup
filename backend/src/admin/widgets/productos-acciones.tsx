import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, Text } from "@medusajs/ui";
import { useNavigate } from "react-router-dom";
import { descargarDesde, imprimirDesde } from "../lib/imprimir";

/**
 * Encima de la lista de productos: el alta completa (con costo y primer lote)
 * y el inventario de todos los almacenes para imprimir o descargar. El botón
 * «Crear» de Medusa sigue ahí, pero no pide costo.
 */
const ProductosAcciones = () => {
    const navegar = useNavigate();
    return (
        <Container className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <div>
                <Heading level="h2">Productos y existencias</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                    Da de alta un producto con su costo y su primer lote, o saca el inventario de todos los almacenes.
                </Text>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    onClick={async () => {
                        const e = await descargarDesde("/admin/reports/export?tipo=inventario&formato=csv", "inventario.csv");
                        if (e) alert(e);
                    }}
                >
                    Descargar inventario
                </Button>
                <Button
                    variant="secondary"
                    onClick={async () => {
                        const e = await imprimirDesde("/admin/reports/export?tipo=inventario&formato=html");
                        if (e) alert(e);
                    }}
                >
                    Imprimir inventario
                </Button>
                <Button onClick={() => navegar("/alta-de-producto")}>Alta de producto con costo</Button>
            </div>
        </Container>
    );
};

export const config = defineWidgetConfig({
    zone: "product.list.before",
});

export default ProductosAcciones;
