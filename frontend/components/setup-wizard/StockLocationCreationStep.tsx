import { StockLocationCreateForm } from '@/components/StockLocationCreateForm';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { AdminStockLocation } from '@medusajs/types';
import React from 'react';
import { ScrollView } from 'react-native';

interface StockLocationCreationStepProps {
  onComplete: (stockLocationId: string) => void;
  onBackToSelection?: () => void;
}

export const StockLocationCreationStep: React.FC<StockLocationCreationStepProps> = ({
  onComplete,
  onBackToSelection,
}) => {
  const handleStockLocationCreated = (stockLocation: AdminStockLocation) => {
    onComplete(stockLocation.id);
  };

  return (
    <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="always">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Create a new stock location</Text>
      <Text className="mb-6 text-gray-300">
        Select where inventory will be sourced from, or add a new location if needed.
      </Text>

      <StockLocationCreateForm onStockLocationCreated={handleStockLocationCreated} />

      {typeof onBackToSelection === 'function' && (
        <Button variant="outline" className="mt-4" onPress={onBackToSelection}>
          Cancel
        </Button>
      )}
    </ScrollView>
  );
};
