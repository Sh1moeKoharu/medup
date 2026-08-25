import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { useCreateCustomer, useCustomers } from '@/api/hooks/customers';
import { useUpdateDraftOrderCustomer } from '@/api/hooks/draft-orders';
import { Form } from '@/components/form/Form';
import { FormButton } from '@/components/form/FormButton';
import { TextField } from '@/components/form/TextField';
import { CircleAlert } from '@/components/icons/circle-alert';
import { InfoBanner } from '@/components/InfoBanner';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import { AdminCustomer } from '@medusajs/types';
import { router, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { z } from 'zod/v4';

const customerFormSchema = z.object({
  email: z.email('Por favor ingrese un correo válido').min(3, 'El correo es requerido'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
});

const AddNewCustomerButton: React.FC<{ onNewCustomer: (customer: AdminCustomer) => void }> = ({ onNewCustomer }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const createCustomer = useCreateCustomer();

  return (
    <>
      <Button
        variant="outline"
        onPress={() => {
          setIsOpen(true);
        }}
      >
        Añadir Nuevo Cliente
      </Button>

      <Dialog
        visible={isOpen}
        title="Añadir Nuevo Cliente"
        onClose={() => setIsOpen(false)}
        dismissOnOverlayPress={true}
        contentClassName="flex-shrink"
      >
        <Form
          schema={customerFormSchema}
          onSubmit={(data, form) => {
            createCustomer.mutate(data, {
              onSuccess: (res) => {
                onNewCustomer(res.customer);
                setIsOpen(false);
                form.reset();
              },
            });
          }}
        >
          <TextField
            name="email"
            placeholder="Correo Electrónico"
            autoComplete="off"
            autoCapitalize="none"
            inputMode="email"
          />
          <TextField name="first_name" placeholder="Nombre" autoComplete="off" autoCapitalize="words" />
          <TextField name="last_name" placeholder="Apellidos" autoComplete="off" autoCapitalize="words" />
          <TextField name="phone" placeholder="Número de Teléfono" autoComplete="off" autoCapitalize="none" inputMode="tel" />
          <FormButton>Crear Cliente</FormButton>
        </Form>
      </Dialog>
    </>
  );
};

const isPlaceholderProduct = (
  product: AdminCustomer | { id: `placeholder_${string}` },
): product is { id: `placeholder_${string}` } => {
  return typeof product.id === 'string' && product.id.startsWith('placeholder_');
};

const CustomerListPlaceholder: React.FC = () => {
  return (
    <View className="flex-row items-center justify-between gap-4 px-4 py-3">
      <View className="h-[17px] w-1/3 rounded-md bg-gray-200" />
      <View className="h-[17px] w-1/3 rounded-md bg-gray-200" />
    </View>
  );
};

const CustomersList: React.FC<{
  q?: string;
  selectedCustomerId?: string;
  onCustomerSelect: (customer: AdminCustomer) => void;
}> = ({ q, selectedCustomerId, onCustomerSelect }) => {
  const customersQuery = useCustomers({
    q,
    order: 'email',
  });

  const renderCustomer = React.useCallback(
    ({ item }: { item: AdminCustomer | { id: `placeholder_${string}` } }) => {
      if (isPlaceholderProduct(item)) {
        return <CustomerListPlaceholder />;
      }

      const customerName = [item.first_name, item.last_name].filter(Boolean).join(' ');

      return (
        <TouchableOpacity
          className={clx('flex-row items-center justify-between gap-4 px-4 py-3', {
            'bg-black': selectedCustomerId === item.id,
          })}
          accessibilityRole="button"
          accessibilityLabel={`Elegir a ${customerName || item.email}`}
          onPress={() => onCustomerSelect(item)}
        >
          {customerName.length > 0 && (
            <Text
              className={clx({
                'text-white': selectedCustomerId === item.id,
              })}
            >
              {customerName}
            </Text>
          )}
          <Text
            className={clx(
              customerName.length > 0
                ? {
                  'text-gray-300': true,
                  'text-gray-400': selectedCustomerId === item.id,
                }
                : {
                  'text-white': selectedCustomerId === item.id,
                },
            )}
          >
            {item.email}
          </Text>
        </TouchableOpacity>
      );
    },
    [onCustomerSelect, selectedCustomerId],
  );

  const data = React.useMemo(() => {
    if (customersQuery.isLoading) {
      return Array.from({ length: 8 }, (_, index) => ({
        id: `placeholder_${index + 1}` as const,
      }));
    }

    const customers = customersQuery.data?.pages.flatMap((page) => page.customers) || [];

    return customers.length > 0 ? customers : null;
  }, [customersQuery]);

  if (customersQuery.isError) {
    return <InfoBanner colorScheme="error">Error cargando clientes. Por favor, intenta de nuevo.</InfoBanner>;
  }

  return (
    <FlatList
      data={data}
      renderItem={renderCustomer}
      keyExtractor={(item) => item.id}
      refreshing={customersQuery.isRefetching}
      ItemSeparatorComponent={() => <View className="mx-4 h-hairline bg-gray-200" />}
      className="overflow-hidden rounded-xl border border-gray-200"
      ListEmptyComponent={
        <View className="items-center justify-center gap-2 px-4 py-10">
          <CircleAlert size={24} />
          {typeof q === 'string' && q.length > 1 ? (
            <Text className="text-center">Ningún cliente coincide{'\n'}con la búsqueda</Text>
          ) : (
            <Text className="text-center">No se encontraron clientes</Text>
          )}
        </View>
      }
      ListFooterComponent={
        customersQuery.isFetchingNextPage ? (
          <View>
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
            <View className="mx-4 h-hairline bg-gray-200" />
            <CustomerListPlaceholder />
          </View>
        ) : null
      }
      onRefresh={() => {
        customersQuery.refetch();
      }}
      onEndReached={() => {
        if (customersQuery.hasNextPage && !customersQuery.isFetchingNextPage) {
          customersQuery.fetchNextPage();
        }
      }}
      keyboardDismissMode={KEYBOARD_DISMISS_MODE}
    />
  );
};

export default function CustomerLookupScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
  }>();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedCustomerId, setSelectedCustomerId] = React.useState<string | undefined>(params.customerId);
  const [selectedCustomer, setSelectedCustomer] = React.useState<AdminCustomer>();
  const updateDraftOrderCustomer = useUpdateDraftOrderCustomer();

  return (
    <Dialog
      visible={true}
      title="Búsqueda de Cliente"
      containerClassName="max-w-2xl"
      onClose={() => router.back()}
      dismissOnOverlayPress={true}
      contentClassName="flex-shrink"
    >
      <View className="mb-4 flex-row items-center gap-2">
        <View className="flex-1">
          <SearchInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar clientes..."
          />
        </View>
        <AddNewCustomerButton
          onNewCustomer={(customer) => {
            setSelectedCustomerId(customer.id);
            setSelectedCustomer(customer);
          }}
        />
      </View>

      <CustomersList
        q={searchQuery ? searchQuery : undefined}
        selectedCustomerId={selectedCustomerId}
        onCustomerSelect={(customer) => {
          setSelectedCustomerId(customer.id);
          setSelectedCustomer(customer);
        }}
      />

      <Button
        className="mb-4 mt-4"
        disabled={!selectedCustomerId}
        onPress={() => {
          if (!selectedCustomerId) {
            return;
          }

          if (selectedCustomer) {
            updateDraftOrderCustomer.mutate(selectedCustomer);
          }

          router.back();
        }}
      >
        {!selectedCustomerId
          ? 'Elige un paciente de la lista'
          : selectedCustomer
            ? `Asignar a ${[selectedCustomer.first_name, selectedCustomer.last_name].filter(Boolean).join(' ') || selectedCustomer.email}`
            : 'Asignar cliente'}
      </Button>

    </Dialog>
  );
}
