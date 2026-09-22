import { Button, Text } from "@medusajs/ui";
import { useRef, useState } from "react";

/**
 * Subir un logotipo: se manda a `/admin/uploads` y se guarda la dirección que
 * devuelve, no la imagen. Lo usan el alta del médico y la configuración de la
 * clínica.
 */

const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const TAMANO_MAXIMO = 1024 * 1024;

export const CampoDeLogo = ({
    etiqueta,
    ayuda,
    valor,
    onChange,
}: {
    etiqueta: string;
    ayuda?: string;
    valor: string;
    onChange: (url: string) => void;
}) => {
    const entrada = useRef<HTMLInputElement>(null);
    const [subiendo, setSubiendo] = useState(false);

    const subir = async (archivo: File) => {
        if (!TIPOS.includes(archivo.type)) {
            alert("El logotipo debe ser PNG, JPG, WebP o SVG.");
            return;
        }
        if (archivo.size > TAMANO_MAXIMO) {
            alert("El logotipo pesa más de 1 MB. Usa una versión más ligera.");
            return;
        }
        setSubiendo(true);
        try {
            const datos = new FormData();
            datos.append("files", archivo);
            const res = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: datos });
            const json = await res.json().catch(() => ({}));
            const url = json?.files?.[0]?.url;
            if (!res.ok || !url) {
                alert(json?.message || "No se pudo subir el logotipo.");
                return;
            }
            onChange(url);
        } finally {
            setSubiendo(false);
        }
    };

    return (
        <div>
            <Text size="small" weight="plus" style={{ marginBottom: 4 }}>{etiqueta}</Text>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                    style={{
                        width: 88,
                        height: 56,
                        borderRadius: 8,
                        border: "1px dashed var(--border-base)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        background: "var(--bg-subtle)",
                    }}
                >
                    {valor ? (
                        <img src={valor} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                        <Text size="xsmall" className="text-ui-fg-muted">Sin logotipo</Text>
                    )}
                </div>
                <input
                    ref={entrada}
                    type="file"
                    accept={TIPOS.join(",")}
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const archivo = e.target.files?.[0];
                        if (archivo) subir(archivo);
                        e.target.value = "";
                    }}
                />
                <Button type="button" variant="secondary" size="small" isLoading={subiendo} onClick={() => entrada.current?.click()}>
                    {valor ? "Cambiar" : "Subir imagen"}
                </Button>
                {valor && (
                    <Button type="button" variant="transparent" size="small" onClick={() => onChange("")}>
                        Quitar
                    </Button>
                )}
            </div>
            {ayuda && <Text size="xsmall" className="text-ui-fg-subtle" style={{ marginTop: 4 }}>{ayuda}</Text>}
        </div>
    );
};
