import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { Clock } from '@/components/icons/clock';
import { SearchInput } from '@/components/SearchInput';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useBreakpointValue } from '@/hooks/useBreakpointValue';
import { FlashList } from '@shopify/flash-list';
import React, { useState } from 'react';
import { View } from 'react-native';

const MOCK_ACTIVITY = [
    { id: '1', user: 'Cajero 1 (Ana)', role: 'Cajero', action: 'Creado nueva orden #1024', time: '10:45 AM', type: 'order' },
    { id: '2', user: 'Admin (Diego)', role: 'Administrador', action: 'Actualizado inventario de "Aspirina 500mg" a 50', time: '10:30 AM', type: 'stock' },
    { id: '3', user: 'Cajero 2 (Luis)', role: 'Cajero', action: 'Reembolsada orden #1020', time: '09:15 AM', type: 'refund' },
    { id: '4', user: 'Sistema CRM', role: 'Sistema', action: 'Sincronizado perfil de cliente Juan Pérez', time: '09:00 AM', type: 'system' },
    { id: '5', user: 'Cajero 1 (Ana)', role: 'Cajero', action: 'Creado nuevo perfil de cliente "María García"', time: '08:45 AM', type: 'customer' },
];

const ActionIcon = ({ type }: { type: string }) => {
    switch (type) {
        case 'order': return <View className="h-2 w-2 rounded-full bg-green-500" />;
        case 'stock': return <View className="h-2 w-2 rounded-full bg-blue-500" />;
        case 'refund': return <View className="h-2 w-2 rounded-full bg-red-500" />;
        case 'system': return <View className="h-2 w-2 rounded-full bg-purple-500" />;
        default: return <View className="h-2 w-2 rounded-full bg-gray-500" />;
    }
};

export default function ActivityScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const numColumns = useBreakpointValue({ base: 1, md: 1, xl: 1 }); // Always 1 column for logs

    const filteredLogs = MOCK_ACTIVITY.filter(log =>
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderLog = React.useCallback(
        ({ item, index }: { item: typeof MOCK_ACTIVITY[0], index: number }) => {
            return (
                <View className="w-full flex-row items-start gap-4 border-b border-gray-100 py-4">
                    <View className="mt-1 h-8 w-8 items-center justify-center rounded-full bg-gray-50">
                        <Clock size={16} className="text-gray-400" />
                    </View>
                    <View className="flex-1 gap-1">
                        <View className="flex-row items-center justify-between">
                            <View className="flex-row items-center gap-2">
                                <Text className="font-semibold">{item.user}</Text>
                                <View className="rounded bg-gray-100 px-1 py-0.5">
                                    <Text className="text-xs text-gray-500">{item.role}</Text>
                                </View>
                            </View>
                            <Text className="text-xs text-gray-400">{item.time}</Text>
                        </View>
                        <View className="flex-row items-center gap-2">
                            <ActionIcon type={item.type} />
                            <Text className="text-gray-600">{item.action}</Text>
                        </View>
                    </View>
                </View>
            );
        },
        [],
    );

    return (
        <Layout>
            <Text className="mt-8 mb-6 text-4xl">Registro de Actividad</Text>

            <SearchInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Filtrar por usuario o acción..."
                className="mb-4"
            />

            <FlashList
                data={filteredLogs}
                renderItem={renderLog}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                automaticallyAdjustKeyboardInsets
                contentContainerClassName="pb-2"
                showsVerticalScrollIndicator={false}
                keyboardDismissMode={KEYBOARD_DISMISS_MODE}
            />
        </Layout>
    );
}
