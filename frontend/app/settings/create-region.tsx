import { RegionCreateForm } from '@/components/RegionCreateForm';
import { Button } from '@/components/ui/Button';
import { LayoutWithKeyboardAvoidingScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useUpdateSettings } from '@/contexts/settings';
import { router } from 'expo-router';

export default function CreateRegionScreen() {
  const updateSettings = useUpdateSettings();

  return (
    <LayoutWithKeyboardAvoidingScroll>
      <Text className="mb-6 text-4xl">Setting Up</Text>
      <Text className="mb-2 text-2xl">Create a region</Text>
      <Text className="mb-6 text-gray-300">
        Create a new region that defines your market area, currency, and tax settings.
      </Text>

      <RegionCreateForm
        onRegionCreated={(region) => {
          updateSettings.mutate(
            {
              region_id: region.id,
            },
            {
              onSuccess: async () => {
                router.dismissTo('/settings');
              },
            },
          );
        }}
      />

      <Button variant="outline" className="mt-4" onPress={() => router.back()}>
        Cancel
      </Button>
    </LayoutWithKeyboardAvoidingScroll>
  );
}
