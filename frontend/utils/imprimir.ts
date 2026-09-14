import { Platform } from 'react-native';

/**
 * Manda un documento HTML a la impresora del navegador.
 *
 * Es el mecanismo del ticket (ver imprimir-recibo.ts, que ahora lo usa),
 * generalizado: sirve para la receta, la nota de atención y el corte de caja,
 * que llegan del servidor ya compuestos (/admin/documents/...).
 *
 * Sobre un IFRAME OCULTO, no una ventana nueva: la ventana la bloquea el
 * navegador salvo que el usuario lo autorice; el iframe nunca. Con la opción
 * --kiosk-printing de Chrome sale directo a la impresora predeterminada.
 */
export function imprimirHtml(html: string): boolean {
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
    // Con retraso: quitarlo en el mismo turno en que se llamó a print()
    // cancela el trabajo en algunos navegadores.
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
    doc.write(html);
    doc.close();

    // onload y el temporizador de respaldo pueden llegar los dos; sin este
    // seguro saldrían DOS copias.
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

    if (marco.contentWindow?.document.readyState === 'complete') {
      lanzar();
    } else {
      marco.onload = lanzar;
      setTimeout(lanzar, 700);
    }

    return true;
  } catch {
    limpiar();
    return false;
  }
}
