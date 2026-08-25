import { useEffect, useState } from 'react';

/**
 * Retrasa la propagación de un valor hasta que deja de cambiar durante `delay`.
 *
 * Se usa en los buscadores: sin esto, cada tecla cambia la clave de la consulta
 * y dispara una petición al servidor. Escribir "paracetamol" son doce peticiones
 * de las que sólo interesa la última, y entre medias la lista se vacía y se
 * vuelve a llenar, lo que además la hace parpadear.
 *
 * El valor que se muestra en el campo sigue siendo inmediato: lo único que se
 * retrasa es la búsqueda.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
