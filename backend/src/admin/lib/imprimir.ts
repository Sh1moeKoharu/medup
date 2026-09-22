/**
 * Abre un documento que compuso el servidor en una pestaña y lanza la
 * impresión. Es el patrón del corte de caja, en un solo lugar para el reporte
 * y el inventario.
 */
export async function imprimirDesde(ruta: string): Promise<string | null> {
    const res = await fetch(ruta, { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.html) {
        return data.error || data.message || "No se pudo obtener el documento.";
    }
    const w = window.open("", "_blank");
    if (!w) {
        return "El navegador bloqueó la pestaña del documento. Permite ventanas emergentes para este sitio.";
    }
    w.document.open();
    w.document.write(data.html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
    return null;
}

/** Descarga un archivo de texto (CSV) que exige la sesión del panel. */
export async function descargarDesde(ruta: string, nombrePorOmision: string): Promise<string | null> {
    const res = await fetch(ruta, { credentials: "include" });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.error || data.message || `El servidor respondió ${res.status}.`;
    }
    const nombre = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? nombrePorOmision;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 1000);
    return null;
}
