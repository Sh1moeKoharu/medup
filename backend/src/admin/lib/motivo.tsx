import { Button, Input, Text, Textarea } from "@medusajs/ui";
import { useEffect, useState } from "react";
import { sinVarianteUnica } from "./titulos";

/**
 * Piezas que comparten las pantallas del panel que corrigen o deshacen algo.
 *
 * ── EL MOTIVO ───────────────────────────────────────────────────────────────
 * Cancelar, anular, corregir o dar de baja pide un motivo de al menos 20
 * caracteres (espejo de LARGO_MINIMO_MOTIVO en lib/ajustes-de-orden.ts). Va
 * en un cuadro dentro de la página, no en un `prompt` del navegador: se ve
 * cuánto falta y se puede pensar antes de confirmar.
 */
export const LARGO_MINIMO_MOTIVO = 20;

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();

export const CuadroDeMotivo = ({
    titulo,
    descripcion,
    etiqueta = "Confirmar",
    enviando,
    onConfirmar,
    onCancelar,
    children,
}: {
    titulo: string;
    descripcion?: string;
    etiqueta?: string;
    enviando?: boolean;
    onConfirmar: (motivo: string) => void;
    onCancelar: () => void;
    /** Campos adicionales (una cantidad, una fecha) que van antes del motivo. */
    children?: React.ReactNode;
}) => {
    const [motivo, setMotivo] = useState("");
    const largo = limpiar(motivo).length;
    const listo = largo >= LARGO_MINIMO_MOTIVO;
    return (
        <div className="flex flex-col gap-2 rounded-md border border-ui-border-strong bg-ui-bg-subtle p-3">
            <Text weight="plus">{titulo}</Text>
            {descripcion && <Text size="small" className="text-ui-fg-subtle">{descripcion}</Text>}
            {children}
            <Textarea
                autoFocus
                rows={2}
                placeholder="Motivo: queda en el registro y en la bitácora"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
            />
            <div className="flex items-center gap-2">
                <Text size="xsmall" className={listo ? "text-ui-fg-base flex-1" : "text-ui-fg-subtle flex-1"}>
                    {listo ? "Motivo suficiente" : `${largo} de ${LARGO_MINIMO_MOTIVO} caracteres como mínimo`}
                </Text>
                <Button size="small" variant="secondary" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
                <Button size="small" disabled={!listo} isLoading={enviando} onClick={() => onConfirmar(limpiar(motivo))}>{etiqueta}</Button>
            </div>
        </div>
    );
};

/** Lo que devuelve el buscador: la presentación (variante) y cómo se llama. */
export type PresentacionElegida = { variant_id: string; title: string; product_id: string };

/**
 * Buscar una presentación del catálogo por nombre. Cada producto de la
 * clínica tiene una sola variante; si tuviera varias, se listan todas.
 */
export const BuscadorDeProducto = ({ onElegir, placeholder = "Buscar presentación…" }: { onElegir: (p: PresentacionElegida) => void; placeholder?: string }) => {
    const [termino, setTermino] = useState("");
    const [resultados, setResultados] = useState<PresentacionElegida[]>([]);
    const [buscando, setBuscando] = useState(false);

    useEffect(() => {
        const q = termino.trim();
        if (q.length < 2) {
            setResultados([]);
            return;
        }
        let vigente = true;
        setBuscando(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/admin/products?q=${encodeURIComponent(q)}&limit=10&fields=id,title,*variants`, { credentials: "include" });
                const data = await res.json().catch(() => ({}));
                if (!vigente) return;
                const lista: PresentacionElegida[] = [];
                for (const p of data.products ?? []) {
                    for (const v of p.variants ?? []) {
                        const unica = (p.variants ?? []).length === 1;
                        lista.push({ variant_id: v.id, product_id: p.id, title: unica ? sinVarianteUnica(p.title) : `${p.title} · ${v.title}` });
                    }
                }
                setResultados(lista);
            } finally {
                if (vigente) setBuscando(false);
            }
        }, 250);
        return () => {
            vigente = false;
            clearTimeout(t);
        };
    }, [termino]);

    return (
        <div className="flex flex-col gap-1">
            <Input placeholder={placeholder} value={termino} onChange={(e) => setTermino(e.target.value)} />
            {buscando && <Text size="xsmall" className="text-ui-fg-muted">Buscando…</Text>}
            {!buscando && termino.trim().length >= 2 && resultados.length === 0 && <Text size="xsmall" className="text-ui-fg-muted">Nada coincide con «{termino}».</Text>}
            {resultados.length > 0 && (
                <div className="flex flex-col overflow-hidden rounded-md border border-ui-border-base">
                    {resultados.map((r) => (
                        <button
                            key={r.variant_id}
                            type="button"
                            className="border-b border-ui-border-base px-3 py-2 text-left text-sm last:border-0 hover:bg-ui-bg-base-hover"
                            onClick={() => {
                                onElegir(r);
                                setTermino("");
                                setResultados([]);
                            }}
                        >
                            {r.title}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/** Un lote, como lo entrega /admin/medical-batches. */
export type Lote = {
    id: string;
    batch_number: string;
    expiration_date: string;
    quantity: number;
    variant_id: string;
    variant_title?: string | null;
    stock_location_id: string | null;
    stock_location_name?: string | null;
    shelf_location?: string | null;
    sale_unit?: string | null;
    status: "active" | "quarantined" | "destroyed";
};

/** "2027-03-31" a partir de una fecha ISO, para un <input type="date">. */
export const aDia = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

/** Llama a la API y devuelve el mensaje de error, o null si salió bien. */
export async function enviar(ruta: string, cuerpo: unknown, metodo = "POST"): Promise<{ error: string | null; data: any }> {
    const res = await fetch(ruta, {
        method: metodo,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detalle = (data.detalle ?? []).map((d: any) => `· ${d.product_title ?? d.variant_id ?? "?"}: faltan ${d.faltante} de ${d.solicitado}`);
        return { error: [data.error, data.message, ...detalle].filter(Boolean).join("\n") || `Error ${res.status}`, data };
    }
    return { error: null, data };
}
