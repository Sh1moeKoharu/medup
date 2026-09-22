import { model } from "@medusajs/framework/utils";

/**
 * Turno de un médico: desde que entra a consulta hasta que sale.
 *
 * Sirve para dos cosas: reportar "el trabajo de cada médico por turno" y
 * calcular sus honorarios por turno. Lo abre y lo cierra el propio médico
 * desde su interfaz; Administración lo ve en los reportes.
 */
export const DoctorShift = model.define("doctor_shift", {
    id: model.id().primaryKey(),
    doctor_id: model.text(),
    doctor_name: model.text().nullable(),
    /**
     * Perfil de quien abrió el turno. La tabla nació para médicos (de ahí
     * `doctor_*`); desde la nómina la usan también Enfermería, Farmacia y
     * Almacén. Nulo en los turnos anteriores, que son todos de médico.
     */
    role: model.text().nullable(),
    opened_at: model.dateTime(),
    closed_at: model.dateTime().nullable(),
    notes: model.text().nullable(),
});
