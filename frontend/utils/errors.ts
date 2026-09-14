import { FetchError } from '@medusajs/js-sdk';
import Toast from 'react-native-toast-message';

/**
 * Network error that occurs during fetch operations
 */
export interface NetworkError extends Error {
  code?: string;
  errno?: number;
  syscall?: string;
  hostname?: string;
}

/**
 * Type guard to check if error is a Medusa FetchError
 */
export const isFetchError = (error: unknown): error is FetchError => {
  return error instanceof FetchError;
};

/**
 * Type guard to check if error is a network error
 */
export const isNetworkError = (error: unknown): error is NetworkError => {
  return error instanceof Error && ('code' in error || 'errno' in error || 'syscall' in error);
};

/**
 * Check if error is an unauthorized error (401)
 */
export const isUnauthorizedError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 401;
};

/**
 * Check if error is a forbidden error (403)
 */
export const isForbiddenError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 403;
};

/**
 * Check if error is a not found error (404)
 */
export const isNotFoundError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 404;
};

/**
 * Check if error is a server error (500)
 */
export const isServerError = (error: unknown): boolean => {
  return isFetchError(error) && error.status === 500;
};

/**
 * Get error message from any error type
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const e = error as any;
    if (e.response?.data?.message) return e.response.data.message;
    if (e.body?.message) return e.body.message;
    if (e.message) return e.message;
    
    try {
      const safeError = {
        message: e.message,
        name: e.name,
        status: e.status,
        body: e.body,
        responseData: e.response?.data
      };
      return JSON.stringify(safeError, null, 2);
    } catch (err) {
      // ignore
    }
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Ocurrió un error desconocido.';
};

/**
 * Los mensajes del servidor llegan en inglés.
 *
 * ── POR QUÉ HACE FALTA ESTO ─────────────────────────────────────────────────
 * Traducir nuestros propios textos no basta. El cuerpo del aviso es
 * `getErrorMessage(error)`, y ahí lo que hay es lo que respondió Medusa: al
 * intentar entrar con una contraseña equivocada salía «Invalid email or
 * password» en una aplicación que por lo demás está entera en español.
 *
 * Medusa no expone códigos de error estables para la mayoría de estos casos,
 * sólo la frase, así que se traduce por coincidencia de texto. La tabla cubre
 * lo que un mostrador se encuentra de verdad; no pretende ser exhaustiva.
 *
 * ── QUÉ PASA CON LO QUE NO ESTÁ EN LA TABLA ─────────────────────────────────
 * Se devuelve una frase genérica EN ESPAÑOL, no el original. Un mensaje suelto
 * en inglés delante de un paciente es peor que una frase clara que no dice el
 * detalle. El texto crudo se manda a la consola, que es donde hace falta para
 * diagnosticar.
 */
const TRADUCCIONES: [RegExp, string][] = [
  [/invalid email or password/i, 'El correo o la contraseña no son correctos.'],
  [/identity with email already exists/i, 'Ya existe una cuenta con ese correo.'],
  [/^unauthorized$/i, 'La sesión no es válida. Vuelve a entrar.'],
  [/(not allowed|do not have permission|forbidden)/i, 'Tu perfil no tiene permiso para hacer esto.'],
  [/was not found|not found/i, 'No se encontró lo que se pedía.'],
  [/(failed to fetch|networkerror|network request failed|load failed)/i,
    'No se pudo contactar con el servidor. Revisa la conexión.'],
  [/insufficient (stock|inventory|quantity)/i, 'No hay existencia suficiente.'],
  [/(is required|missing required)/i, 'Faltan datos obligatorios.'],
  [/invalid request/i, 'La petición no es válida.'],
  [/timeout|timed out/i, 'El servidor tardó demasiado en responder.'],
];

export const traducirMensajeDelServidor = (mensaje: string): string => {
  if (!mensaje) return 'No se pudo completar la operación.';

  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(mensaje)) return traduccion;
  }

  // Si no lleva ni una letra inglesa reconocible, lo más probable es que ya
  // venga en español desde nuestro propio backend: se deja tal cual.
  const pareceIngles = /\b(the|is|was|not|cannot|could|must|invalid|failed|error|with|this|does)\b/i;
  if (!pareceIngles.test(mensaje)) return mensaje;

  console.error('[Altus] Mensaje del servidor sin traducir:', mensaje);
  return 'No se pudo completar la operación.';
};

/** El mensaje de un error, ya en español. */
export const mensajeDeError = (error: unknown): string =>
  traducirMensajeDelServidor(getErrorMessage(error));

export const showErrorToast = (error: unknown) => {
  if (isUnauthorizedError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Sesión no válida',
      text2: 'Vuelve a iniciar sesión para continuar.',
    });
    return;
  }

  if (isForbiddenError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Sin permiso',
      text2: 'Tu perfil no tiene permiso para hacer esto.',
    });
    return;
  }

  if (isNotFoundError(error)) {
    Toast.show({
      type: 'error',
      text1: 'No encontrado',
      text2: 'No se encontró lo que se pedía.',
    });
    return;
  }

  if (isServerError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Error del servidor',
      text2: mensajeDeError(error),
    });
    return;
  }

  if (isNetworkError(error)) {
    Toast.show({
      type: 'error',
      text1: 'Sin conexión',
      text2: 'No se pudo contactar con el servidor. Revisa la conexión.',
    });
    return;
  }

  Toast.show({
    type: 'error',
    text1: 'Algo salió mal',
    text2: mensajeDeError(error),
  });
};
