import { RegionCreateForm } from '@/components/RegionCreateForm';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { AdminRegion } from '@medusajs/types';
import React from 'react';
import { ScrollView } from 'react-native';

interface RegionCreationStepProps {
  onComplete: (regionId: string) => void;
  onBackToSelection?: () => void;
}

export const RegionCreationStep: React.FC<RegionCreationStepProps> = ({ onComplete, onBackToSelection }) => {
  const handleRegionCreated = (region: AdminRegion) => {
    onComplete(region.id);
  };

  return (
    <ScrollView contentContainerClassName="p-5" keyboardShouldPersistTaps="always">
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Choose a region</Text>
      <Text className="mb-6 text-gray-300">
        Create a new region that defines your market area, currency, and tax settings.
      </Text>

      <RegionCreateForm onRegionCreated={handleRegionCreated} />

      {typeof onBackToSelection === 'function' && (
        <Button variant="outline" className="mt-4" onPress={onBackToSelection}>
          Cancel
        </Button>
      )}
    </ScrollView>
  );
};
