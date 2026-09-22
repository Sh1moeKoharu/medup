import { useAbrirTurnoMedico, useCerrarTurnoMedico, useMiTurnoMedico } from '@/api/hooks/honorarios';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import React from 'react';

/**
 * «Mi turno»: desde que empieza la jornada hasta que termina. Las horas en
 * turno son la base del pago por hora y del pago fijo por turno de la nómina,
 * y aparecen en el reporte de actividad. Nació para el médico; desde la
 * nómina lo usan también Enfermería, Farmacia y Almacén.
 */
export const MiTurno: React.FC<{ ayuda?: string }> = ({ ayuda = 'Ábrelo al empezar tu jornada y ciérralo al terminar: tus horas cuentan para tu pago.' }) => {
  const turno = useMiTurnoMedico();
  const abrir = useAbrirTurnoMedico();
  const cerrar = useCerrarTurnoMedico();

  return (
    <>
      <Text className="mb-4 text-2xl">Mi turno</Text>
      {turno.data ? (
        <>
          <Text className="mb-2 text-gray-400">
            Abierto desde {new Date(turno.data.opened_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Button variant="outline" className="mb-8" onPress={() => cerrar.mutate(turno.data!.id)} isPending={cerrar.isPending}>
            Cerrar turno
          </Button>
        </>
      ) : (
        <>
          <Text className="mb-2 text-gray-400">Sin turno abierto. {ayuda}</Text>
          <Button className="mb-8" onPress={() => abrir.mutate()} isPending={abrir.isPending || turno.isLoading}>
            Abrir turno
          </Button>
        </>
      )}
    </>
  );
};
