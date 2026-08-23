import { useCustomers, useMedicalCustomers } from '@/api/hooks/customers';
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

const CustomerDetails = ({ customer, onClose }: { customer: CustomerWithMedical; onClose: () => void }) => {

    return (
        <SafeAreaView className="flex-1 bg-white">
            <Layout className="flex-1 pb-6 mt-4">
                <View className="mb-6 flex-row items-center justify-between">
                    <Text className="text-4xl text-black">Perfil del Paciente</Text>
                    <TouchableOpacity onPress={onClose} className="rounded-full bg-gray-100 px-4 py-2">
                        <Text className="font-semibold text-gray-700">Cerrar</Text>
                    </TouchableOpacity>
                </View>

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
                            <View className="mt-4 p-4 bg-white rounded-xl border border-blue-200">
                                <Text className="font-bold text-blue-900 mb-2">Expediente Médico</Text>
                                {medRecord.insurance_policy && <Text className="text-sm text-gray-700 mb-2 font-medium">No. Póliza: {medRecord.insurance_policy}</Text>}
                                {medRecord.medical_history && (
                                    <View className="mt-2 p-3 bg-blue-50 rounded-lg">
                                        <Text className="text-sm text-gray-800 tracking-wide leading-relaxed">{typeof medRecord.medical_history === 'string' ? medRecord.medical_history : JSON.stringify(medRecord.medical_history)}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })()}
                </View>
            </Layout>
        </SafeAreaView>
    );
};

export default function DoctorCRMScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMedical | null>(null);
    const numColumns = useBreakpointValue({ base: 1, md: 2, xl: 3 });

    const customersQuery = useCustomers({
        ...(searchQuery ? { q: searchQuery } : {})
    });

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
                        <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                            <UserRound size={24} className="text-blue-500" />
                        </View>
                        <View className="flex-1">
                            <View className="flex-row items-center gap-2">
                                <Text className="text-lg font-semibold">{[item.first_name, item.last_name].filter(Boolean).join(' ') || 'Paciente Sin Nombre'}</Text>
                                {item.has_account && (
                                    <View className="rounded-full bg-blue-100 px-2 py-0.5">
                                        <Text className="text-xs font-bold text-blue-700">Cuenta</Text>
                                    </View>
                                )}
                            </View>
                            {item.phone && <Text className="text-gray-500">{item.phone}</Text>}
                        </View>
                        <View className="items-end">
                            <Text className="font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full overflow-hidden">Historial &rarr;</Text>
                        </View>
                    </TouchableOpacity>
                </View>
            );
        },
        [numColumns],
    );

    return (
        <Layout>
            <Text className="mt-8 mb-6 text-4xl">Pacientes / Directorio</Text>

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
                    keyExtractor={(item: any) => item.id}
                    numColumns={numColumns}
                    ItemSeparatorComponent={() => <View className="h-4 w-full" />}
                    automaticallyAdjustKeyboardInsets
                    contentContainerClassName="pb-2"
                    showsVerticalScrollIndicator={false}
                    keyboardDismissMode="on-drag"
                />
            )}

            <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setSelectedCustomer(null)}>
                {selectedCustomer && (
                    <CustomerDetails customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
                )}
            </Modal>
        </Layout>
    );
}
