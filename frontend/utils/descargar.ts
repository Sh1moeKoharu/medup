import { Platform } from 'react-native';

/**
 * Entrega un texto al navegador como archivo para descargar.
 *
 * Sirve para el CSV de caducidades: la ruta del servidor exige el token en la
 * cabecera, así que un enlace directo no funcionaría (el navegador no lo
 * mandaría). Se pide con `fetch` y lo que llega se convierte en archivo aquí.
 *
 * Sólo en web: en nativo no hay dónde dejarlo sin permisos de almacenamiento,
 * y el POS corre en el navegador de la clínica.
 */
export function descargarTexto(nombre: string, contenido: string, tipo = 'text/plain;charset=utf-8'): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof URL === 'undefined') {
    return false;
  }
  try {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Con retraso: revocar en el mismo turno cancela la descarga en algunos
    // navegadores.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);
    return true;
  } catch {
    return false;
  }
}
