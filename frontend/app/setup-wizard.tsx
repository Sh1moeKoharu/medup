import { useRegions } from '@/api/hooks/regions';
import { useSalesChannels } from '@/api/hooks/sales-channel';
import { useStockLocations } from '@/api/hooks/stock-location';
import { SetupWizardContent } from '@/components/setup-wizard/SetupWizardContent';
import { showErrorToast } from '@/utils/errors';
import * as React from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SetupWizardScreen() {
  const salesChannelsQuery = useSalesChannels();
  const stockLocationsQuery = useStockLocations();
  const regionsQuery = useRegions();

  React.useEffect(() => {
    if (salesChannelsQuery.isError) {
      showErrorToast(salesChannelsQuery.error);
    }
    if (stockLocationsQuery.isError) {
      showErrorToast(stockLocationsQuery.error);
    }
    if (regionsQuery.isError) {
      showErrorToast(regionsQuery.error);
    }
  }, [
    salesChannelsQuery.isError,
    stockLocationsQuery.isError,
    regionsQuery.isError,
    salesChannelsQuery.error,
    stockLocationsQuery.error,
    regionsQuery.error,
  ]);

  const isLoading = salesChannelsQuery.isLoading || stockLocationsQuery.isLoading || regionsQuery.isLoading;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" className="text-gray-600" />
      </SafeAreaView>
    );
  }

  const hasSalesChannels = (salesChannelsQuery.data?.pages?.[0]?.sales_channels?.length ?? 0) > 0;
  const hasStockLocations = (stockLocationsQuery.data?.pages?.[0]?.stock_locations?.length ?? 0) > 0;
  const hasRegions = (regionsQuery.data?.pages?.[0]?.regions?.length ?? 0) > 0;

  return (
    <SetupWizardContent
      hasSalesChannels={hasSalesChannels}
      hasStockLocations={hasStockLocations}
      hasRegions={hasRegions}
    />
  );
}
