import { SalesChannelCreateForm } from '@/components/SalesChannelCreateForm';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { AdminSalesChannel } from '@medusajs/types';
import React from 'react';
import { ScrollView } from 'react-native';

interface SalesChannelCreationStepProps {
  onComplete: (salesChannelId: string) => void;
  onBackToSelection?: () => void;
}

export const SalesChannelCreationStep: React.FC<SalesChannelCreationStepProps> = ({
  onComplete,
  onBackToSelection,
}) => {
  const handleSalesChannelCreated = (salesChannel: AdminSalesChannel) => {
    onComplete(salesChannel.id);
  };

  return (
    <ScrollView contentContainerClassName="p-5">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Choose a sales channel</Text>
      <Text className="mb-6 text-gray-300">
        Select an existing sales channel from the list or create a new one to proceed.
      </Text>

      <SalesChannelCreateForm onSalesChannelCreated={handleSalesChannelCreated} />

      {typeof onBackToSelection === 'function' && (
        <Button variant="outline" className="mt-4" onPress={onBackToSelection}>
          Cancel
        </Button>
      )}
    </ScrollView>
  );
};
