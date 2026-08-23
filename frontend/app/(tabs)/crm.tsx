import { useCustomers, useMedicalCustomers } from '@/api/hooks/customers';
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

const CustomerDetails = ({ customer, onClose }: { customer: CustomerWithMedical; onClose: () => void }) => {
    const ordersQuery = useOrders({ customer_id: customer.id });

    return (
        <SafeAreaView className="flex-1 bg-white">
            <Layout className="flex-1 pb-6 mt-4">
                <View className="mb-6 flex-row items-center justify-between">
                    <Text className="text-4xl text-black">Perfil del Cliente</Text>
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
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMedical | null>(null);
    const numColumns = useBreakpointValue({ base: 1, md: 2, xl: 3 });

    const customersQuery = useCustomers({
        ...(searchQuery ? { q: searchQuery } : {})
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
            <Text className="mt-8 mb-6 text-4xl">CRM / Directorio</Text>

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
