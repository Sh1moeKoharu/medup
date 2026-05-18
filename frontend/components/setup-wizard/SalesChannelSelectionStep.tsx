import { SalesChannelList } from '@/components/SalesChannelList';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import React, { useState } from 'react';
import { View } from 'react-native';

interface SalesChannelSelectionStepProps {
  onComplete: (salesChannelId: string) => void;
  onCreateNew: () => void;
  initialValue?: string;
}

export const SalesChannelSelectionStep: React.FC<SalesChannelSelectionStepProps> = ({
  onComplete,
  onCreateNew,
  initialValue = '',
}) => {
  const [selectedSalesChannel, setSelectedSalesChannel] = useState(initialValue);

  const handleSalesChannelSelect = (salesChannelId: string) => {
    setSelectedSalesChannel(salesChannelId);
  };

  return (
    <View className="flex-1 p-5">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Choose a sales channel</Text>
      <Text className="mb-6 text-gray-300">
        Select an existing sales channel from the list or create a new one to proceed.
      </Text>

      <SalesChannelList selectedSalesChannelId={selectedSalesChannel} onSalesChannelSelect={handleSalesChannelSelect} />

      <Button variant="outline" onPress={onCreateNew} className="mt-6">
        Create New Sales Channel
      </Button>

      <Button onPress={() => onComplete(selectedSalesChannel)} disabled={!selectedSalesChannel} className="mt-4">
        Next
      </Button>
    </View>
  );
};
