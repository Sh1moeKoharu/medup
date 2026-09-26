import { usePacientesConPendientes } from '@/components/pacientes/usePacientesConPendientes';
import { contactoDePaciente } from '@/utils/paciente';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useCustomers, useMedicalCustomers } from '@/api/hooks/customers';
import { useNotasDeAtencion } from '@/api/hooks/clinica';
import { TarjetaDeNota } from '@/components/clinica/TarjetaDeNota';
import { useOrdenesMedicas } from '@/api/hooks/medical-orders';
import { FormularioPaciente } from '@/components/pacientes/FormularioPaciente';
import { AseguranzasDelPaciente } from '@/components/pacientes/AseguranzasDelPaciente';
import { EncabezadoDeReceta } from '@/components/receta/EncabezadoDeReceta';
import { Button } from '@/components/ui/Button';
import { useReceta } from '@/contexts/receta';
import { router } from 'expo-router';
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

const fechaCorta = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/**
 * Lo que quien atiende necesita ver del paciente antes de la consulta: las
 * notas de atención anteriores y las recetas que se le han emitido. Antes la
 * ficha sólo enseñaba los datos de contacto y, si lo había, el expediente; se
 * vio en el manual del médico, con una paciente con quince notas y la ficha
 * en blanco.
 */
const HistorialClinico = ({ customerId }: { customerId: string }) => {
    const notas = useNotasDeAtencion({ customer_id: customerId });
    const recetas = useOrdenesMedicas({ customer_id: customerId });
    const listaNotas = notas.data ?? [];
    const listaRecetas = [...(recetas.data ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const ESTADO: Record<string, string> = { pending: 'Pendiente', dispensed: 'Surtida', cancelled: 'Cancelada' };

    return (
        <>
            <Text className="mb-2 text-2xl">Notas de atención</Text>
            {notas.isLoading ? (
                <Text className="mb-6 text-gray-400">Cargando…</Text>
            ) : listaNotas.length === 0 ? (
                <Text className="mb-6 text-gray-400">Sin notas de atención todavía.</Text>
            ) : (
                <View className="mb-6 gap-2">
                    {listaNotas.slice(0, 10).map((n) => (
                        <TarjetaDeNota key={n.id} nota={n} />
                    ))}
                    {listaNotas.length > 10 && <Text className="text-sm text-gray-400">Se muestran las 10 más recientes de {listaNotas.length}.</Text>}
                </View>
            )}

            <Text className="mb-2 text-2xl">Recetas anteriores</Text>
            {recetas.isLoading ? (
                <Text className="mb-6 text-gray-400">Cargando…</Text>
            ) : listaRecetas.length === 0 ? (
                <Text className="mb-6 text-gray-400">Sin recetas todavía.</Text>
            ) : (
                <View className="mb-6 gap-2">
                    {listaRecetas.slice(0, 10).map((o) => (
                        <View key={o.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                            <View className="flex-row items-start justify-between gap-3">
                                <Text className="text-xs text-gray-400">{fechaCorta(o.created_at)} · {o.creator_name ?? 'médico'} · {o.recipient_area === 'nursing' ? 'consulta' : 'mostrador'}</Text>
                                <Text className="text-xs text-gray-500">{ESTADO[o.status] ?? o.status}</Text>
                            </View>
                            {o.items.map((i) => (
                                <Text key={i.id} className="mt-1 text-gray-800">
                                    {i.quantity} × {i.product_title ?? i.variant_id}{i.instructions ? ` · ${i.instructions}` : ''}
                                </Text>
                            ))}
                        </View>
                    ))}
                </View>
            )}
        </>
    );
};

const CustomerDetails = ({ customer, onClose, onEdit, onNuevaReceta }: { customer: CustomerWithMedical; onClose: () => void; onEdit: () => void; onNuevaReceta: () => void }) => {

    return (
        <SafeAreaView className="flex-1 bg-canvas">
            <Layout className="flex-1 pb-6 mt-4">
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-6 flex-row items-center justify-between">
                    <Text className="text-4xl text-black">Perfil del paciente</Text>
                    <View className="flex-row items-center gap-2">
                        {/* La consulta empieza aquí: el paciente ya queda en la
                            receta y se pasa al catálogo a armarla. */}
                        <TouchableOpacity onPress={onNuevaReceta} className="rounded-full bg-black px-4 py-2" accessibilityLabel={`Nueva receta para ${[customer.first_name, customer.last_name].filter(Boolean).join(' ')}`}>
                            <Text className="font-semibold text-white">Nueva receta</Text>
                        </TouchableOpacity>
                        {/* Quien atiende corrige datos del paciente en consulta: un
                            teléfono, un apellido. Es el mismo formulario que usa Caja. */}
                        <TouchableOpacity onPress={onEdit} className="rounded-full bg-info-200 px-4 py-2">
                            <Text className="font-semibold text-info-500">Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClose} className="rounded-full bg-gray-100 px-4 py-2">
                            <Text className="font-semibold text-gray-700">Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View className="mb-6 rounded-2xl border border-gray-200 p-6 bg-gray-50">
                    <Text className="text-2xl font-bold mb-2">{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Sin nombre'}</Text>
                    <AseguranzasDelPaciente customerId={customer.id} className="mb-2" />

                    {(() => {
                        const medRecord = (customer as any).medical_customer;
                        if (!medRecord) return null;
                        return (
                            <View className="mb-3 flex-row items-center">
                                <View className={`rounded-full px-2 py-1 ${medRecord.customer_type === 'b2b' ? 'bg-info-200' : 'bg-gray-100'}`}>
                                    <Text className={`text-xs font-bold ${medRecord.customer_type === 'b2b' ? 'text-info-500' : 'text-gray-500'}`}>
                                        {medRecord.customer_type === 'b2b' ? 'B2B / Hospital' : 'B2C / Paciente'}
                                    </Text>
                                </View>
                                {medRecord.company_name && <Text className="ml-2 font-semibold text-gray-700">{medRecord.company_name}</Text>}
                            </View>
                        );
                    })()}

                    {!!contactoDePaciente(customer) && <Text className="text-lg text-gray-600 mb-1">{contactoDePaciente(customer)}</Text>}

                    {(() => {
                        const medRecord = (customer as any).medical_customer;
                        if (!medRecord?.medical_history && !medRecord?.insurance_policy && !medRecord?.insurances?.length) return null;
                        return (
                            <View className="mt-4 p-4 bg-white rounded-xl border border-info-300">
                                <Text className="font-bold text-info-500 mb-2">Expediente médico</Text>
                                {medRecord.insurance_policy && <Text className="text-sm text-gray-700 mb-2 font-medium">No. Póliza: {medRecord.insurance_policy}</Text>}
                                {medRecord.medical_history && (
                                    <View className="mt-2 p-3 bg-info-200 rounded-xl">
                                        <Text className="text-sm text-gray-800 tracking-wide leading-relaxed">{typeof medRecord.medical_history === 'string' ? medRecord.medical_history : JSON.stringify(medRecord.medical_history)}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })()}
                </View>

                <HistorialClinico customerId={customer.id} />
              </ScrollView>
            </Layout>
        </SafeAreaView>
    );
};

export default function DoctorCRMScreen() {
    const [searchQuery, setSearchQuery] = useState('');
  // El campo se actualiza al instante; la búsqueda espera a que dejes de teclear.
  const busqueda = useDebouncedValue(searchQuery);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMedical | null>(null);
    const [editando, setEditando] = useState(false);
    // El alta vivía sólo dentro de «Seleccionar paciente» de la receta; quien
    // buscaba en esta pestaña no la encontraba. Ahora está donde se busca.
    const [creando, setCreando] = useState(false);
    const receta = useReceta();

    const nuevaRecetaPara = (c: CustomerWithMedical) => {
        receta.asignarPaciente(c);
        setSelectedCustomer(null);
        router.push('/(doctor)/products');
    };
    const numColumns = useBreakpointValue({ base: 1, md: 2, xl: 3 });

    const customersQuery = useCustomers({
        ...(busqueda ? { q: busqueda } : {})
    });

    const medicalQuery = useMedicalCustomers();
    // Con orden o receta pendiente, arriba (punto 16). Al buscar, manda la búsqueda.
    const pendientes = usePacientesConPendientes();

    const customers = useMemo(() => {
        const cargados = customersQuery.data?.pages.flatMap((page) => page.customers) || [];
        const arriba = busqueda ? [] : pendientes.lista;
        const raw = [...arriba, ...cargados.filter((c) => !arriba.some((p) => p.id === c.id))];
        const medicalData = medicalQuery.data || {};

        return raw.map(c => ({
            ...c,
            medical_customer: medicalData[c.id] || null
        })) as CustomerWithMedical[];
    }, [customersQuery.data, medicalQuery.data, pendientes.lista, busqueda]);

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
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-info-200">
                            <UserRound size={24} className="text-info-500" />
                        </View>
                        <View className="flex-1">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-lg font-semibold">{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'Paciente sin nombre'}</Text>
                                {item.has_account && (
                                    <View className="rounded-full bg-info-200 px-2 py-0.5">
                                        <Text className="text-xs font-bold text-info-500">Cuenta</Text>
                                    </View>
                                )}
                                {!!pendientes.conteo.get(item.id) && (
                                    <View className="rounded-full bg-warning-200 px-2 py-0.5">
                                        <Text className="text-xs font-bold text-warning-500">
                                            {pendientes.conteo.get(item.id) === 1 ? 'Orden pendiente' : `${pendientes.conteo.get(item.id)} órdenes pendientes`}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            {item.phone && <Text className="text-gray-500">{item.phone}</Text>}
                        </View>
                        <View className="items-end">
                            <Text className="font-medium text-info-500 bg-info-200 px-3 py-1 rounded-full overflow-hidden">Historial &rarr;</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        },
        [numColumns, pendientes.conteo],
    );

    return (
        <Layout>
            <View className="mt-8 mb-2 flex-row items-center justify-between">
                <Text className="text-4xl">Pacientes</Text>
                <Button variant="outline" onPress={() => setCreando(true)}>
                    Nuevo paciente
                </Button>
            </View>
            <EncabezadoDeReceta compacto />

            <SearchInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar paciente por nombre..."
                className="mb-4"
            />

            {customersQuery.isLoading ? (
                <ActivityIndicator size="large" className="text-gray-600 mt-10" />
            ) : (
                <FlashList
                    data={customers as any[]}
                    renderItem={renderCustomer}
                    extraData={pendientes.conteo}
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
                        onEdit={() => setEditando(true)}
                        onNuevaReceta={() => nuevaRecetaPara(selectedCustomer)}
                    />
                )}
            </Modal>

            {/* Se monta sólo mientras está abierto, para que arranque vacío. Al
                guardar, el paciente nuevo se abre de inmediato: lo normal es que
                la consulta siga con él. */}
            {creando && (
                <FormularioPaciente
                    visible={creando}
                    onClose={() => setCreando(false)}
                    onSaved={(nuevo) => setSelectedCustomer({ ...nuevo, medical_customer: null })}
                />
            )}

            {editando && selectedCustomer && (
                <FormularioPaciente
                    visible={editando}
                    customer={selectedCustomer}
                    onClose={() => setEditando(false)}
                    onSaved={(actualizado) => setSelectedCustomer((previo) => (previo ? { ...previo, ...actualizado } : previo))}
                />
            )}
        </Layout>
    );
}
