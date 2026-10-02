import type { Apartado } from '@/components/medico/Apartados';
import { useReceta } from '@/contexts/receta';
import * as React from 'react';

/**
 * En qué apartado está la pantalla única del médico (Pacientes, Productos o
 * Mis recetas).
 *
 * ── POR QUÉ UN CONTEXTO ─────────────────────────────────────────────────────
 * El selector vive en la pantalla de Consulta, pero la RECETA —la columna
 * lateral, o su pestaña en teléfono— también tiene que poder mandar al
 * apartado Pacientes: «Elige un paciente» ya no abre una ventana de búsqueda
 * aparte, lleva al único sitio donde se buscan y se dan de alta.
 *
 * Sólo lo provee el grupo de pantallas del médico. Enfermería comparte la
 * pantalla de receta pero no esta pantalla única: fuera del proveedor el hook
 * devuelve null y la receta conserva su ventana de búsqueda.
 */
type Valor = { apartado: Apartado; setApartado: (a: Apartado) => void };

const Contexto = React.createContext<Valor | null>(null);

export const ProveedorDeApartado: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const receta = useReceta();
  // Sin paciente en la receta se empieza por Pacientes —por ahí arranca la
  // consulta—; con uno ya elegido, por el catálogo.
  const [apartado, setApartado] = React.useState<Apartado>(() => (receta.paciente ? 'productos' : 'pacientes'));
  const valor = React.useMemo(() => ({ apartado, setApartado }), [apartado]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
};

/** null fuera de las pantallas del médico. */
export const useApartadoDelMedico = (): Valor | null => React.useContext(Contexto);
