import { defineRouteConfig } from "@medusajs/admin-sdk";
import { ReceiptPercent } from "@medusajs/icons";
import { Button, Container, Heading, Input, Text, Textarea } from "@medusajs/ui";
import { useEffect, useState } from "react";

/**
 * Contenido del ticket de venta.
 *
 * Existe porque el ticket salía encabezado con "Medusa Store" —el nombre de
 * fábrica del motor— y porque cada negocio necesita imprimir cosas distintas.
 * Cablearlo en el código serviría para esta clínica y para ninguna otra.
 *
 * Los datos se guardan en el servidor, no en el dispositivo: el ticket debe
 * salir igual desde cualquier caja.
 */

type Config = {
    nombre: string;
    direccion: string;
    telefono: string;
    rfc: string;
    pie: string;
};

const VACIA: Config = { nombre: "", direccion: "", telefono: "", rfc: "", pie: "" };

const ReciboPage = () => {
    const [config, setConfig] = useState<Config>(VACIA);
    const [nombreTienda, setNombreTienda] = useState<string>("");
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/admin/receipt-config", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d) => {
                setConfig({ ...VACIA, ...(d.configuracion ?? {}) });
                setNombreTienda(d.nombre_tienda ?? "");
            })
            .catch((e) => setError(`No se pudo cargar la configuración: ${e.message}`))
            .finally(() => setCargando(false));
    }, []);

    const guardar = async () => {
        setGuardando(true);
        setAviso("");
        setError("");
        try {
            const res = await fetch("/admin/receipt-config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(config),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            setConfig({ ...VACIA, ...(data.configuracion ?? {}) });
            setAviso("Guardado. Los tickets que se impriman a partir de ahora ya lo llevan.");
        } catch (e: any) {
            setError(e?.message || "No se pudo guardar.");
        } finally {
            setGuardando(false);
        }
    };

    const campo = (
        clave: keyof Config,
        etiqueta: string,
        ayuda: string,
        marcador: string
    ) => (
        <div style={{ marginBottom: 20 }}>
            <Text size="small" weight="plus" style={{ marginBottom: 4 }}>
                {etiqueta}
            </Text>
            <Input
                value={config[clave]}
                placeholder={marcador}
                onChange={(e) => setConfig({ ...config, [clave]: e.target.value })}
            />
            <Text size="small" style={{ color: "#9ca3af", marginTop: 4 }}>
                {ayuda}
            </Text>
        </div>
    );

    if (cargando) {
        return (
            <Container className="p-6">
                <Text>Cargando…</Text>
            </Container>
        );
    }

    const usandoNombreDeFabrica =
        !config.nombre && nombreTienda.toLowerCase() === "medusa store";

    return (
        <Container className="p-6">
            <Heading level="h1" style={{ marginBottom: 8 }}>
                Contenido del ticket
            </Heading>
            <Text style={{ color: "#6b7280", marginBottom: 24 }}>
                Lo que se imprime en el comprobante de venta. Aplica a todas las cajas.
            </Text>

            {usandoNombreDeFabrica && (
                <div
                    style={{
                        marginBottom: 20,
                        padding: 12,
                        borderRadius: 8,
                        background: "#FEF3C7",
                        border: "1px solid #FDE68A",
                    }}
                >
                    <Text size="small">
                        Los tickets se están imprimiendo sin nombre de negocio. Escribe el
                        nombre abajo para que salga encabezado correctamente.
                    </Text>
                </div>
            )}

            {campo(
                "nombre",
                "Nombre del negocio",
                "Encabeza el ticket. Es lo primero que ve el cliente.",
                "Ej. Farmacia San Rafael"
            )}
            {campo(
                "direccion",
                "Domicilio",
                "Opcional. Se imprime debajo del nombre.",
                "Ej. Av. Revolución 1234, Col. Centro, Tijuana"
            )}
            {campo("telefono", "Teléfono", "Opcional.", "Ej. 664 123 4567")}
            {campo(
                "rfc",
                "RFC",
                "Opcional. Se imprime para que el cliente pueda solicitar su factura después. Ponerlo NO convierte el ticket en factura: el CFDI exige timbrado con un PAC.",
                "Ej. XAXX010101000"
            )}

            <div style={{ marginBottom: 20 }}>
                <Text size="small" weight="plus" style={{ marginBottom: 4 }}>
                    Leyenda al pie
                </Text>
                <Textarea
                    rows={2}
                    value={config.pie}
                    placeholder="Ej. Gracias por su compra. Cambios y devoluciones dentro de 24 h con este ticket."
                    onChange={(e) => setConfig({ ...config, pie: e.target.value })}
                />
                <Text size="small" style={{ color: "#9ca3af", marginTop: 4 }}>
                    Texto libre al final del ticket. Un rollo de 80mm admite líneas cortas;
                    lo muy largo se recorta.
                </Text>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Button onClick={guardar} isLoading={guardando}>
                    Guardar
                </Button>
                {!!aviso && <Text size="small" style={{ color: "#059669" }}>{aviso}</Text>}
                {!!error && <Text size="small" style={{ color: "#dc2626" }}>{error}</Text>}
            </div>

            <div
                style={{
                    marginTop: 32,
                    paddingTop: 20,
                    borderTop: "1px solid #e5e7eb",
                }}
            >
                <Text size="small" style={{ color: "#6b7280" }}>
                    El ticket siempre incluye el folio, la fecha, quién cobró, las líneas con
                    su importe, los totales y la leyenda de que no es un comprobante fiscal.
                    Eso no se configura porque son los datos que hacen que el comprobante
                    sirva.
                </Text>
            </div>
        </Container>
    );
};

export const config = defineRouteConfig({
    label: "Ticket",
    icon: ReceiptPercent,
});

export default ReciboPage;
