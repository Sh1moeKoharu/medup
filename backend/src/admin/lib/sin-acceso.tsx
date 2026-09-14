import { Container, Heading, Text } from "@medusajs/ui";

/**
 * La pantalla de «sin acceso» del panel.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 * Cuando el servidor deniega una lectura (403), las páginas del panel dejaban
 * la lista vacía y decían «no hay nada»: para quien miraba, el sistema estaba
 * vacío, no cerrado. Es mentira por omisión, y además hace que un fallo de
 * permisos se investigue como un fallo de datos.
 *
 * Con el panel cerrado a todo el que no sea Administración importa menos —a
 * Administración nada se le deniega—, pero sigue siendo lo correcto, y vale
 * para el día en que se abra el panel a otro perfil de forma temporal.
 *
 * La bitácora ya tenía su versión; ésta es la de todos.
 */
export const SinAcceso = ({ recurso }: { recurso: string }) => (
  <Container className="p-8 flex flex-col items-center justify-center min-h-[400px]">
    <Heading level="h2">Sin acceso</Heading>
    <Text className="text-ui-fg-subtle mt-2 text-center">
      Tu perfil no puede consultar {recurso}. Si crees que sí debería, habla con Administración.
    </Text>
  </Container>
);

/** ¿La respuesta del servidor fue una negativa de permisos? */
export const esDenegado = (res: Response) => res.status === 403 || res.status === 401;
