import { AseguranzaDePaciente, useAseguranzasDePaciente, useGuardarAseguranzasDePaciente } from '@/api/hooks/aseguranzas';
import { useCreateCustomer, useUpdateCustomer } from '@/api/hooks/customers';
import { SelectorDeAseguranzas } from '@/components/pacientes/AseguranzasDelPaciente';
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
  customer?: (Pick<AdminCustomer, 'id' | 'email' | 'first_name' | 'last_name' | 'phone'> & { medical_customer?: any }) | null;
  onClose: () => void;
  onSaved?: (customer: AdminCustomer) => void;
}> = ({ visible, customer, onClose, onSaved }) => {
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const guardarAseguranzas = useGuardarAseguranzasDePaciente();
  const editando = !!customer;

  // Las aseguranzas viven en el expediente (medical_customer), no en el
  // cliente de Medusa: se guardan aparte, justo después del paciente.
  const actuales = useAseguranzasDePaciente(customer?.id, visible && editando);
  const iniciales = (): AseguranzaDePaciente[] => actuales.data ?? (Array.isArray(customer?.medical_customer?.insurances) ? customer!.medical_customer.insurances : []);
  const [aseguranzas, setAseguranzas] = React.useState<AseguranzaDePaciente[]>(iniciales);
  React.useEffect(() => {
    if (visible) setAseguranzas(iniciales());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, customer?.id, actuales.data]);
  const cambiaron = JSON.stringify(aseguranzas) !== JSON.stringify(iniciales());

  const terminar = (guardado: AdminCustomer, despues?: () => void) => {
    const seguir = () => {
      onSaved?.(guardado);
      onClose();
      despues?.();
    };
    if (aseguranzas.length || cambiaron) {
      guardarAseguranzas.mutate({ customerId: guardado.id, insurances: aseguranzas }, { onSuccess: seguir, onError: seguir });
    } else {
      seguir();
    }
  };

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
                onSuccess: (res) => terminar(res.customer),
              },
            );
            return;
          }

          createCustomer.mutate(data, {
            onSuccess: (res) => terminar(res.customer, () => form.reset()),
          });
        }}
      >
        <TextField name="first_name" placeholder="Nombre" autoComplete="off" autoCapitalize="words" />
        <TextField name="last_name" placeholder="Apellidos" autoComplete="off" autoCapitalize="words" />
        <TextField name="phone" placeholder="Número de teléfono" autoComplete="off" autoCapitalize="none" inputMode="tel" />
        <SelectorDeAseguranzas valor={aseguranzas} onChange={setAseguranzas} />
        <FormButton>{editando ? 'Guardar cambios' : 'Crear paciente'}</FormButton>
      </Form>
    </Dialog>
  );
};
