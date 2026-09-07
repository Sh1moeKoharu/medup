import { Platform } from 'react-native';

/**
 * Con qué dirección hablar con el servidor.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 * El POS guarda la dirección del servidor la primera vez que alguien inicia
 * sesión, y la reutiliza en los arranques siguientes. Eso está bien hasta el
 * día que el servidor pasa de http a https.
 *
 * Ese día, cada tableta que ya había entrado tiene guardado `http://192.168...`
 * mientras la página se sirve por `https://`. El navegador BLOQUEA esa mezcla
 * —contenido activo sin cifrar dentro de una página cifrada— y no la deja
 * salir. Desde fuera se ve como que el punto de venta dejó de funcionar, sin
 * ningún mensaje que explique por qué, y en todos los equipos a la vez.
 *
 * ── POR QUÉ SE PUEDE CORREGIR SOLO ──────────────────────────────────────────
 * Nginx sirve el POS y la API en el mismo origen. La dirección desde la que se
 * abrió esta página ES la dirección del servidor. Así que cuando la guardada
 * apunta al mismo sitio por http y la página va por https, no hay ninguna duda
 * sobre qué quería decir: lo mismo, cifrado.
 *
 * Y no es una preferencia estética. Mantener la guardada no ofrece nada: esa
 * petición no va a salir del navegador de todos modos.
 *
 * ── LO QUE NO TOCA ──────────────────────────────────────────────────────────
 * En desarrollo el POS corre en un puerto y el backend en otro, los dos por
 * http. Como la página no va por https, esta corrección no se activa y la
 * dirección escrita a mano se respeta.
 */
export function resolverUrlServidor(guardada?: string | null): string {
  const respaldo = guardada || process.env.EXPO_PUBLIC_MEDUSA_API_URL || '';

  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return respaldo;
  }

  const origen = window.location?.origin ?? '';
  if (!origen) {
    return respaldo;
  }

  if (!guardada) {
    return origen;
  }

  // Sólo el caso que el navegador va a bloquear: página cifrada, dirección
  // guardada sin cifrar. Cualquier otra combinación se deja como está.
  const paginaCifrada = window.location.protocol === 'https:';
  const guardadaSinCifrar = guardada.startsWith('http://');

  return paginaCifrada && guardadaSinCifrar ? origen : guardada;
}
