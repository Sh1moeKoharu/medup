import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ShoppingCart } from "@medusajs/icons";
import { Button, Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";

/**
 * Atajo del panel al punto de venta.
 *
 * El POS es una aplicación aparte (Expo). Con Nginx delante ambos se sirven
 * desde el mismo origen — el panel en /app y el POS en la raíz —, así que basta
 * un enlace interno: el cajero ya no tiene que recordar ni teclear otra
 * dirección.
 *
 * Se implementa como RUTA y no como widget porque los widgets sólo se montan en
 * zonas concretas (listas de productos, pedidos, clientes), y no aparecen en el
 * menú lateral. `defineRouteConfig` con `label` es la única forma soportada de
 * agregar una entrada al menú.
 *
 * La dirección se toma de `window.__ALTUS_POS_URL__`, que medusa-config.ts
 * inyecta durante el build a partir de ADMIN_POS_URL. Por omisión "/", que es
 * donde queda con la configuración de Nginx del repo. Se deja configurable
 * porque en desarrollo el POS corre en otro puerto.
 */

const DEFAULT_POS_URL = "/";

function getPosUrl(): string {
    if (typeof window === "undefined") {
        return DEFAULT_POS_URL;
    }
    return (window as any).__ALTUS_POS_URL__ || DEFAULT_POS_URL;
}

const PosRedirectPage = () => {
    const [url] = useState(getPosUrl);
    const [redirigiendo, setRedirigiendo] = useState(true);

    useEffect(() => {
        // Pequeña espera antes de saltar: si el navegador bloquea la navegación
        // o la dirección está mal, el usuario alcanza a ver el enlace manual en
        // lugar de quedarse ante una pantalla en blanco.
        const t = setTimeout(() => {
            try {
                window.location.href = url;
            } catch {
                setRedirigiendo(false);
            }
        }, 400);

        const fallback = setTimeout(() => setRedirigiendo(false), 3000);

        return () => {
            clearTimeout(t);
            clearTimeout(fallback);
        };
    }, [url]);

    return (
        <Container className="p-8 flex flex-col items-center justify-center min-h-[400px] gap-4">
            <Heading level="h2">Punto de Venta</Heading>

            {redirigiendo ? (
                <Text className="text-ui-fg-subtle">Abriendo el punto de venta…</Text>
            ) : (
                <Text className="text-ui-fg-subtle text-center max-w-md">
                    No se pudo abrir automáticamente. Usa el botón para entrar.
                </Text>
            )}

            <Button variant="primary" onClick={() => { window.location.href = url; }}>
                Abrir punto de venta
            </Button>

            <Text className="text-ui-fg-muted text-xs">{url}</Text>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Punto de Venta",
    icon: ShoppingCart,
});

export default PosRedirectPage;
