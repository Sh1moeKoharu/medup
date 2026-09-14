import { PantallaReceta } from '@/components/receta/PantallaReceta';

/**
 * La receta del área médica. La pantalla vive en components/receta para que
 * Médico y Enfermería compartan UNA implementación (antes eran dos copias
 * idénticas del carrito de caja que ni siquiera creaban la orden médica).
 */
export default function DoctorCartScreen({ isSidebar }: { isSidebar?: boolean }) {
  return <PantallaReceta isSidebar={isSidebar} />;
}
