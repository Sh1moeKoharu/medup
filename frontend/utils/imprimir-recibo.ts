import { Platform } from 'react-native';

/**
 * Impresión del recibo de venta.
 *
 * ── CÓMO IMPRIME ────────────────────────────────────────────────────────────
 * Con la impresión del propio navegador. Sirve cualquier impresora que el
 * equipo ya tenga instalada —térmica de 80mm, o una normal en hoja— sin
 * comprar hardware ni instalar nada en cada caja.
 *
 * Se hace sobre un IFRAME OCULTO y no abriendo una ventana nueva. Una ventana
 * nueva la bloquea el navegador salvo que el usuario lo autorice, y el cajero
 * vería un botón que "a veces no hace nada". El iframe no se bloquea nunca.
 *
 * El documento se escribe con sus propios estilos, aislado del resto de la
 * aplicación: así la hoja de estilos del POS no se cuela en el ticket.
 *
 * ── QUÉ NO HACE ─────────────────────────────────────────────────────────────
 * No decide el contenido. Eso lo arma el servidor en /admin/receipts/:id, que
 * es donde también vive la regla sobre medicamentos controlados. Aquí sólo se
 * maqueta lo que llegó.
 */

export type LineaRecibo = {
  descripcion: string;
  controlado: boolean;
  cantidad: number;
  precio_unitario: number;
  importe: number;
};

export type Recibo = {
  folio: number | string | null;
  fecha: string;
  establecimiento: string;
  cajero: string | null;
  cliente: string | null;
  lineas: LineaRecibo[];
  moneda: string;
  subtotal: number;
  descuentos: number;
  impuestos: number;
  total: number;
  metodo_pago: string | null;
  leyendas: string[];
};

const NOMBRE_METODO: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
};

/** Escapa el texto antes de meterlo en el HTML del ticket. */
function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dinero(cantidad: number, moneda: string): string {
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda,
      currencyDisplay: 'narrowSymbol',
    }).format(cantidad);
  } catch {
    return `$${cantidad.toFixed(2)}`;
  }
}

function fechaLarga(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function construirHtmlRecibo(r: Recibo): string {
  const lineas = r.lineas
    .map(
      (l) => `
      <tr>
        <td class="desc">
          ${esc(l.descripcion)}
          <div class="sub">${l.cantidad} x ${esc(dinero(l.precio_unitario, r.moneda))}</div>
        </td>
        <td class="imp">${esc(dinero(l.importe, r.moneda))}</td>
      </tr>`
    )
    .join('');

  const fila = (etiqueta: string, valor: number, fuerte = false) => `
    <tr class="${fuerte ? 'fuerte' : ''}">
      <td>${esc(etiqueta)}</td>
      <td class="imp">${esc(dinero(valor, r.moneda))}</td>
    </tr>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Recibo ${esc(r.folio ?? '')}</title>
<style>
  /* 80mm es el rollo térmico habitual. Si se imprime en hoja normal, el
     contenido queda centrado arriba en lugar de deformarse. */
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-monospace, "Cascadia Mono", "Courier New", monospace;
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    width: 72mm;
  }
  h1 { font-size: 13px; margin: 0 0 2px; text-align: center; letter-spacing: .5px; }
  .centro { text-align: center; }
  .meta { margin: 6px 0; }
  .meta div { display: flex; justify-content: space-between; gap: 8px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  .desc { padding-right: 6px; word-break: break-word; }
  .sub { color: #444; font-size: 10px; }
  .imp { text-align: right; white-space: nowrap; }
  .fuerte td { font-weight: 700; font-size: 13px; padding-top: 4px; }
  .leyendas { margin-top: 8px; font-size: 9px; line-height: 1.3; }
  .leyendas p { margin: 0 0 3px; }
  .gracias { margin-top: 10px; text-align: center; font-size: 10px; }
</style>
</head>
<body>
  <h1>${esc(r.establecimiento)}</h1>
  <div class="centro">Comprobante de venta</div>

  <div class="meta">
    <div><span>Folio</span><span>${esc(r.folio ?? 's/f')}</span></div>
    <div><span>Fecha</span><span>${esc(fechaLarga(r.fecha))}</span></div>
    ${r.cajero ? `<div><span>Atendió</span><span>${esc(r.cajero)}</span></div>` : ''}
    ${r.cliente ? `<div><span>Cliente</span><span>${esc(r.cliente)}</span></div>` : ''}
    ${r.metodo_pago ? `<div><span>Pago</span><span>${esc(NOMBRE_METODO[r.metodo_pago] ?? r.metodo_pago)}</span></div>` : ''}
  </div>

  <hr>
  <table>${lineas}</table>
  <hr>

  <table>
    ${fila('Subtotal', r.subtotal)}
    ${r.descuentos ? fila('Descuentos', -Math.abs(r.descuentos)) : ''}
    ${r.impuestos ? fila('Impuestos', r.impuestos) : ''}
    ${fila('TOTAL', r.total, true)}
  </table>

  <div class="leyendas">
    ${r.leyendas.map((l) => `<p>${esc(l)}</p>`).join('')}
  </div>

  <div class="gracias">Gracias por su compra</div>
</body>
</html>`;
}

/**
 * Manda el recibo a la impresora. Devuelve `false` si no se pudo intentar.
 */
export function imprimirRecibo(recibo: Recibo): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return false;
  }

  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  // Fuera de la vista pero PRESENTE en el documento: `display:none` haría que
  // algunos navegadores no lo compongan y saldría una hoja en blanco.
  marco.style.position = 'fixed';
  marco.style.right = '0';
  marco.style.bottom = '0';
  marco.style.width = '0';
  marco.style.height = '0';
  marco.style.border = '0';

  document.body.appendChild(marco);

  const limpiar = () => {
    // Se retira con retraso: quitarlo en el mismo turno en que se llamó a
    // print() cancela el trabajo en algunos navegadores.
    setTimeout(() => {
      if (marco.parentNode) marco.parentNode.removeChild(marco);
    }, 1000);
  };

  try {
    const doc = marco.contentWindow?.document;
    if (!doc) {
      limpiar();
      return false;
    }

    doc.open();
    doc.write(construirHtmlRecibo(recibo));
    doc.close();

    // onload y el temporizador de respaldo pueden llegar los dos. Sin este
    // seguro se llamaria a print() dos veces y saldrian DOS tickets, que en un
    // mostrador es peor que ninguno: alguien se lleva el duplicado.
    let yaLanzado = false;
    const lanzar = () => {
      if (yaLanzado) return;
      yaLanzado = true;
      try {
        marco.contentWindow?.focus();
        marco.contentWindow?.print();
      } catch {
        // El navegador rechazó la impresión; nada más que hacer aquí.
      } finally {
        limpiar();
      }
    };

    // Si el documento ya terminó de cargar, se imprime enseguida; si no, se
    // espera. Sin esto el ticket puede salir a medio maquetar.
    if (marco.contentWindow?.document.readyState === 'complete') {
      lanzar();
    } else {
      marco.onload = lanzar;
      // Red de seguridad por si `onload` no llega.
      setTimeout(lanzar, 700);
    }

    return true;
  } catch {
    limpiar();
    return false;
  }
}
