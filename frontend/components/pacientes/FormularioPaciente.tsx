import { useCreateCustomer, useUpdateCustomer } from '@/api/hooks/customers';
import { Form } from '@/components/form/Form';
import { FormButton } from '@/components/form/FormButton';
import { TextField } from '@/components/form/TextField';
import { Dialog } from '@/components/ui/Dialog';
import { AdminCustomer } from '@medusajs/types';
import React from 'react';
import { z } from 'zod/v4';

/**
 * Alta y modificación de pacientes.
 *
 * Vivía dentro de la pantalla de pacientes de Caja; el médico y Enfermería
 * también corrigen datos del paciente en consulta (un teléfono, un apellido
 * mal escrito), así que el formulario es uno solo y cada pantalla lo abre.
 * El permiso real es del servidor: todo el personal operativo puede
 * escribir en /admin/customers (ver backend/src/lib/api-policy.ts).
 */

/**
 * Sin correo: los pacientes no lo llevan (lo pidió la clínica). Nombre y
 * apellidos son obligatorios porque salen en la receta y en la cuenta.
 */
export const esquemaPaciente = z.object({
  first_name: z.string().trim().min(2, 'El nombre es requerido'),
  last_name: z.string().trim().min(2, 'Los apellidos son requeridos'),
  phone: z.string().trim().optional(),
});
const esquema = esquemaPaciente;

export const FormularioPaciente: React.FC<{
  visible: boolean;
  customer?: Pick<AdminCustomer, 'id' | 'email' | 'first_name' | 'last_name' | 'phone'> | null;
  onClose: () => void;
  onSaved?: (customer: AdminCustomer) => void;
}> = ({ visible, customer, onClose, onSaved }) => {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const editando = !!customer;

  return (
    <Dialog
      visible={visible}
      title={editando ? 'Editar paciente' : 'Nuevo paciente'}
      onClose={onClose}
      dismissOnOverlayPress={true}
      contentClassName="flex-shrink"
    >
      <Form
        schema={esquema}
        defaultValues={{
          first_name: customer?.first_name ?? '',
          last_name: customer?.last_name ?? '',
          phone: customer?.phone ?? '',
        }}
        onSubmit={(data, form) => {
          if (editando && customer) {
            updateCustomer.mutate(
              { id: customer.id, update: data },
              {
                onSuccess: (res) => {
                  onSaved?.(res.customer);
                  onClose();
                },
              },
            );
            return;
          }

          createCustomer.mutate(data, {
            onSuccess: (res) => {
              onSaved?.(res.customer);
              onClose();
              form.reset();
            },
          });
        }}
      >
        <TextField name="first_name" placeholder="Nombre" autoComplete="off" autoCapitalize="words" />
        <TextField name="last_name" placeholder="Apellidos" autoComplete="off" autoCapitalize="words" />
        <TextField name="phone" placeholder="Número de teléfono" autoComplete="off" autoCapitalize="none" inputMode="tel" />
        <FormButton>{editando ? 'Guardar cambios' : 'Crear paciente'}</FormButton>
      </Form>
    </Dialog>
  );
};
