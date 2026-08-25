import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import {
    useCreateCustomer,
    useCustomers,
    useDeleteCustomer,
    useMedicalCustomers,
    useUpdateCustomer,
} from '@/api/hooks/customers';
import { useAuthCtx } from '@/contexts/auth';
import { ROLES, normalizeRole } from '@/constants/roles';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Form } from '@/components/form/Form';
import { FormButton } from '@/components/form/FormButton';
import { TextField } from '@/components/form/TextField';
import { z } from 'zod/v4';
import { useOrders } from '@/api/hooks/orders';
import { UserRound } from '@/components/icons/user-round';
import { SearchInput } from '@/components/SearchInput';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useBreakpointValue } from '@/hooks/useBreakpointValue';
import { clx } from '@/utils/clx';
import { AdminCustomer } from '@medusajs/types';
import { FlashList } from '@shopify/flash-list';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, TouchableOpacity, View } from 'react-native';

type CustomerWithMedical = AdminCustomer & { medical_customer?: any };


const customerFormSchema = z.object({
    email: z.email('Ingresa un correo válido').min(3, 'El correo es requerido'),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    phone: z.string().optional(),
});

/**
 * Alta y modificación de pacientes desde el directorio.
 *
 * Antes el directorio sólo LISTABA: no había forma de dar de alta, corregir ni
 * dar de baja a nadie desde aquí. El alta existía únicamente escondida dentro
 * del buscador de clientes del carrito, que es un sitio al que sólo se llega
 * mientras se está cobrando.
 *
 * El mismo formulario sirve para los dos casos; lo único que cambia es si se
 * parte de un paciente existente.
 */
const CustomerFormDialog: React.FC<{
    visible: boolean;
    customer?: CustomerWithMedical | null;
    onClose: () => void;
    onSaved?: (customer: AdminCustomer) => void;
}> = ({ visible, customer, onClose, onSaved }) => {
    const createCustomer = useCreateCustomer();
    const updateCustomer = useUpdateCustomer();
    const editando = !!customer;

    return (
        <Dialog
            visible={visible}
            title={editando ? 'Editar Paciente' : 'Nuevo Paciente'}
            onClose={onClose}
            dismissOnOverlayPress={true}
            contentClassName="flex-shrink"
        >
            <Form
                schema={customerFormSchema}
                defaultValues={{
                    email: customer?.email ?? '',
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
                <TextField name="email" placeholder="Correo Electrónico" autoComplete="off" autoCapitalize="none" inputMode="email" />
                <TextField name="first_name" placeholder="Nombre" autoComplete="off" autoCapitalize="words" />
                <TextField name="last_name" placeholder="Apellidos" autoComplete="off" autoCapitalize="none" />
                <TextField name="phone" placeholder="Número de Teléfono" autoComplete="off" autoCapitalize="none" inputMode="tel" />
                <FormButton>{editando ? 'Guardar Cambios' : 'Crear Paciente'}</FormButton>
            </Form>
        </Dialog>
    );
};

const CustomerDetails = ({
    customer,
    onClose,
    onEdit,
    onDeleted,
}: {
    customer: CustomerWithMedical;
    onClose: () => void;
    onEdit: () => void;
    onDeleted: () => void;
}) => {
    const ordersQuery = useOrders({ customer_id: customer.id });
    const deleteCustomer = useDeleteCustomer();
    const { state } = useAuthCtx();
    const [confirmandoBaja, setConfirmandoBaja] = useState(false);

    // La baja se ofrece sólo a quien el servidor se la va a permitir. El
    // permiso real vive en el backend (api-policy.ts); esto sólo evita mostrar
    // un botón que siempre terminaría en un 403.
    const rol = state.status === 'authenticated' ? normalizeRole(state.user.role) : null;
    const puedeDarDeBaja = rol === ROLES.ADMIN;

    return (
        <SafeAreaView className="flex-1 bg-white">
            <Layout className="flex-1 pb-6 mt-4">
                <View className="mb-6 flex-row items-center justify-between">
                    <Text className="text-4xl text-black">Perfil del Cliente</Text>
                    <View className="flex-row items-center gap-2">
                        <TouchableOpacity onPress={onEdit} className="rounded-full bg-blue-50 px-4 py-2">
                            <Text className="font-semibold text-blue-700">Editar</Text>
                        </TouchableOpacity>
                        {puedeDarDeBaja && (
                            <TouchableOpacity
                                onPress={() => setConfirmandoBaja(true)}
                                className="rounded-full bg-red-50 px-4 py-2"
                            >
                                <Text className="font-semibold text-red-700">Eliminar</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} className="rounded-full bg-gray-100 px-4 py-2">
                            <Text className="font-semibold text-gray-700">Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <Dialog
                    visible={confirmandoBaja}
                    title="Dar de baja al paciente"
                    onClose={() => setConfirmandoBaja(false)}
                    dismissOnOverlayPress={true}
                >
                    <Text className="mb-2">
                        Se eliminara el registro de{' '}
                        {[customer.first_name, customer.last_name].filter(Boolean).join(' ') || customer.email}.
                    </Text>
                    <Text className="mb-6 text-sm text-gray-500">
                        Sus compras y ordenes medicas quedaran sin paciente asociado. Esta accion no se
                        puede deshacer.
                    </Text>
                    <View className="flex-row justify-end gap-2">
                        <Button variant="outline" onPress={() => setConfirmandoBaja(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onPress={() =>
                                deleteCustomer.mutate(customer.id, {
                                    onSuccess: () => {
                                        setConfirmandoBaja(false);
                                        onDeleted();
                                    },
                                })
                            }
                        >
                            Eliminar
                        </Button>
                    </View>
                </Dialog>

                <View className="mb-6 rounded-2xl border border-gray-200 p-6 bg-gray-50">
                    <Text className="text-2xl font-bold mb-2">{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Sin Nombre'}</Text>

                    {(() => {
                        const medRecord = (customer as any).medical_customer;
                        if (!medRecord) return null;
                        return (
                            <View className="mb-3 flex-row items-center">
                                <View className={`rounded-full px-2 py-1 ${medRecord.customer_type === 'b2b' ? 'bg-purple-100' : 'bg-green-100'}`}>
                                    <Text className={`text-xs font-bold ${medRecord.customer_type === 'b2b' ? 'text-purple-700' : 'text-green-700'}`}>
                                        {medRecord.customer_type === 'b2b' ? 'B2B / Hospital' : 'B2C / Paciente'}
                                    </Text>
                                </View>
                                {medRecord.company_name && <Text className="ml-2 font-semibold text-gray-700">{medRecord.company_name}</Text>}
                            </View>
                        );
                    })()}

                    <Text className="text-lg text-gray-600 mb-1">{customer.email}</Text>
                    {customer.phone && <Text className="text-lg text-gray-600 mt-1">{customer.phone}</Text>}

                    {(() => {
                        const medRecord = (customer as any).medical_customer;
                        if (!medRecord?.medical_history && !medRecord?.insurance_policy) return null;
                        return (
                            <View className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                                <Text className="font-bold text-gray-800 mb-1">Expediente Médico</Text>
                                {medRecord.insurance_policy && <Text className="text-sm text-gray-600">Seguro: {medRecord.insurance_policy}</Text>}
                                {medRecord.medical_history && (
                                    <View className="mt-1 p-2 bg-gray-50 rounded">
                                        <Text className="text-xs text-gray-500">Historial: {typeof medRecord.medical_history === 'string' ? medRecord.medical_history : JSON.stringify(medRecord.medical_history)}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })()}
                </View>

                <Text className="mb-4 text-2xl font-semibold border-b border-gray-200 pb-2">Adquisiciones / Órdenes</Text>

                {ordersQuery.isLoading ? (
                    <ActivityIndicator size="large" className="mt-8 text-gray-600" />
                ) : (
                    <ScrollView className="flex-1 showsVerticalScrollIndicator={false}">
                        {ordersQuery.data?.pages.flatMap(p => p.orders).map(order => (
                            <View key={order.id} className="mb-4 rounded-xl border border-gray-200 p-4 w-full bg-white shadow-sm">
                                <View className="flex-row justify-between items-center mb-2">
                                    <View>
                                        <Text className="font-bold text-lg">Orden #{order.display_id}</Text>
                                        <Text className="text-gray-500">{new Date(order.created_at).toLocaleDateString()}</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="font-bold text-xl text-green-700">
                                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: order.currency_code }).format((order.total || 0) / 100)}
                                        </Text>
                                        <Text className="text-xs text-gray-500 uppercase mt-1 px-2 py-0.5 bg-gray-100 rounded-md overflow-hidden">{order.status}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                        {(!ordersQuery.data?.pages[0]?.orders || ordersQuery.data?.pages[0]?.orders.length === 0) && (
                            <Text className="text-gray-500 mt-4 text-center text-lg">No se encontraron adquisiciones para este cliente.</Text>
                        )}
                    </ScrollView>
                )}
            </Layout>
        </SafeAreaView>
    );
};

export default function CRMScreen() {
    const [searchQuery, setSearchQuery] = useState('');
  // El campo se actualiza al instante; la búsqueda espera a que dejes de teclear.
  const busqueda = useDebouncedValue(searchQuery);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMedical | null>(null);
    const [formularioAbierto, setFormularioAbierto] = useState(false);
    const [customerEnEdicion, setCustomerEnEdicion] = useState<CustomerWithMedical | null>(null);
    const numColumns = useBreakpointValue({ base: 1, md: 2, xl: 3 });

    const customersQuery = useCustomers({
        ...(busqueda ? { q: busqueda } : {})
    });

    // Fetch individual medical data
    const medicalQuery = useMedicalCustomers();

    const customers = useMemo(() => {
        const raw = customersQuery.data?.pages.flatMap((page) => page.customers) || [];
        const medicalData = medicalQuery.data || {};

        return raw.map(c => ({
            ...c,
            medical_customer: medicalData[c.id] || null
        })) as CustomerWithMedical[];
    }, [customersQuery.data, medicalQuery.data]);

    const renderCustomer = React.useCallback(
        ({ item, index }: { item: CustomerWithMedical, index: number }) => {
            return (
                <View
                    className={clx('w-full px-2', {
                        'pl-0': index % numColumns === 0,
                        'pr-0': (index + 1) % numColumns === 0,
                    })}
                >
                    <TouchableOpacity
                        className="w-full flex-row items-center gap-4 rounded-2xl border border-gray-200 p-4 bg-white shadow-sm"
                        activeOpacity={0.7}
                        onPress={() => setSelectedCustomer(item)}
                    >
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                            <UserRound size={24} className="text-gray-500" />
                        </View>
                        <View className="flex-1">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-lg font-semibold">{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'Cliente Sin Nombre'}</Text>
                                {item.has_account && (
                                    <View className="rounded-full bg-blue-100 px-2 py-0.5">
                                        <Text className="text-xs font-bold text-blue-700">Cuenta</Text>
                                    </View>
                                )}
                            </View>
                            <Text className="text-gray-500">{item.email}</Text>
                            {item.phone && <Text className="text-gray-500">{item.phone}</Text>}
                        </View>
                        <View className="items-end">
                            <Text className="font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full overflow-hidden">Detalles &rarr;</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        },
        [numColumns],
    );

    return (
        <Layout>
            <View className="mt-8 mb-6 flex-row items-center justify-between">
                <Text className="text-4xl">CRM / Directorio</Text>
                <Button
                    variant="outline"
                    onPress={() => {
                        setCustomerEnEdicion(null);
                        setFormularioAbierto(true);
                    }}
                >
                    Nuevo Paciente
                </Button>
            </View>

            <SearchInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar clientes por nombre o correo..."
                className="mb-4"
            />

            {customersQuery.isLoading ? (
                <ActivityIndicator size="large" className="text-gray-600 mt-10" />
            ) : (
                <FlashList
                    data={customers as any[]}
                    renderItem={renderCustomer}
                    keyExtractor={(item: any) => item.id}
                    numColumns={numColumns}
                    ItemSeparatorComponent={() => <View className="h-4 w-full" />}
                    automaticallyAdjustKeyboardInsets
                    contentContainerClassName="pb-2"
                    showsVerticalScrollIndicator={false}
                    keyboardDismissMode={KEYBOARD_DISMISS_MODE}
                />
            )}

            <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setSelectedCustomer(null)}>
                {selectedCustomer && (
                    <CustomerDetails
                        customer={selectedCustomer}
                        onClose={() => setSelectedCustomer(null)}
                        onEdit={() => {
                            setCustomerEnEdicion(selectedCustomer);
                            setFormularioAbierto(true);
                        }}
                        onDeleted={() => setSelectedCustomer(null)}
                    />
                )}
            </Modal>

            {/* Se monta solo mientras esta abierto: asi el formulario arranca
                siempre con los datos del paciente correcto, en lugar de conservar
                los valores iniciales del primero que se abrio. */}
            {formularioAbierto && (
                <CustomerFormDialog
                    visible={formularioAbierto}
                    customer={customerEnEdicion}
                    onClose={() => {
                        setFormularioAbierto(false);
                        setCustomerEnEdicion(null);
                    }}
                    onSaved={(actualizado) => {
                        if (customerEnEdicion) {
                            setSelectedCustomer((previo) =>
                                previo ? { ...previo, ...actualizado } : previo,
                            );
                        }
                    }}
                />
            )}
        </Layout>
    );
}
