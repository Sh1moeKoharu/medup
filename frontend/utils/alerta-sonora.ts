import { Platform } from 'react-native';

/**
 * Un tono corto para avisar de que llegó algo, sin archivos de audio.
 *
 * ── POR QUÉ SIN ARCHIVO ─────────────────────────────────────────────────────
 * Un .mp3 hay que empaquetarlo, servirlo y esperar a que cargue; un tono
 * sintetizado con la Web Audio API está disponible en el instante y pesa cero.
 * Para "llegó una orden" basta con dos notas.
 *
 * ── LA REGLA DEL NAVEGADOR ──────────────────────────────────────────────────
 * Chrome no deja sonar nada hasta que la persona haya tocado la página al
 * menos una vez. Por eso `prepararAlertaSonora` se llama desde un botón —el
 * "Sí, activar" del aviso— y, por si acaso, se vuelve a intentar en el primer
 * toque que haya después. Si aun así no se puede, `sonarAlerta` devuelve
 * false y el aviso visual sigue saliendo: el sonido es un extra, no la única
 * señal.
 *
 * Sólo web. En una app nativa este módulo no hace nada y lo dice con `false`.
 */

type Contexto = AudioContext;

let contexto: Contexto | null = null;
let escuchandoToque = false;

const obtenerContexto = (): Contexto | null => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  if (!contexto) contexto = new Constructor();
  return contexto;
};

/** Reanuda el audio en el próximo toque, para cubrir el caso de que la página se haya recargado. */
const reanudarConElProximoToque = () => {
  if (escuchandoToque || typeof document === 'undefined') return;
  escuchandoToque = true;
  const alTocar = () => {
    document.removeEventListener('pointerdown', alTocar, true);
    escuchandoToque = false;
    obtenerContexto()?.resume().catch(() => undefined);
  };
  document.addEventListener('pointerdown', alTocar, true);
};

/** Llamar desde un gesto del usuario (un botón). Devuelve si el audio está disponible. */
export function prepararAlertaSonora(): boolean {
  const c = obtenerContexto();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  reanudarConElProximoToque();
  return true;
}

/** Dos notas cortas. Devuelve false si el navegador no dejó sonar. */
export async function sonarAlerta(): Promise<boolean> {
  const c = obtenerContexto();
  if (!c) return false;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      reanudarConElProximoToque();
      return false;
    }
  }
  if (c.state !== 'running') {
    reanudarConElProximoToque();
    return false;
  }

  const inicio = c.currentTime;
  const notas: [number, number][] = [
    [880, 0],
    [1175, 0.18],
  ];
  for (const [frecuencia, retraso] of notas) {
    const oscilador = c.createOscillator();
    const ganancia = c.createGain();
    oscilador.type = 'sine';
    oscilador.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(0.0001, inicio + retraso);
    ganancia.gain.exponentialRampToValueAtTime(0.25, inicio + retraso + 0.02);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + retraso + 0.16);
    oscilador.connect(ganancia).connect(c.destination);
    oscilador.start(inicio + retraso);
    oscilador.stop(inicio + retraso + 0.18);
  }
  return true;
}
