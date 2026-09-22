/**
 * Cómo se nombra y se contacta a un paciente en pantalla.
 *
 * Los pacientes ya no llevan correo: la clínica lo pidió, y en un mostrador
 * pedirlo sólo produce correos inventados. Quedan fichas antiguas que sí lo
 * tienen; se enseña como último recurso, nunca como identidad.
 */
type Persona = { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null };

export const nombreDePaciente = (p: Persona | null | undefined, porOmision = 'Paciente sin nombre') =>
  [p?.first_name, p?.last_name].filter(Boolean).join(' ') || porOmision;

/** Teléfono si lo hay; si no, el correo de una ficha antigua; si no, nada. */
export const contactoDePaciente = (p: Persona | null | undefined) => p?.phone || p?.email || '';
