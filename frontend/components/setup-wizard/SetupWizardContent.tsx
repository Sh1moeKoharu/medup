import { useUpdateSettings } from '@/contexts/settings';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from '../KeyboardAvoidingView';
import { RegionCreationStep } from './RegionCreationStep';
import { RegionSelectionStep } from './RegionSelectionStep';
import { SalesChannelCreationStep } from './SalesChannelCreationStep';
import { SalesChannelSelectionStep } from './SalesChannelSelectionStep';
import { StockLocationCreationStep } from './StockLocationCreationStep';
import { StockLocationSelectionStep } from './StockLocationSelectionStep';
import { WelcomeStep } from './WelcomeStep';

// Step definitions
type SetupStep =
  | 'sales-channel-selection'
  | 'sales-channel-creation'
  | 'region-selection'
  | 'region-creation'
  | 'stock-location-selection'
  | 'stock-location-creation'
  | 'welcome';

interface SetupWizardContentProps {
  hasSalesChannels: boolean;
  hasStockLocations: boolean;
  hasRegions: boolean;
}

export const SetupWizardContent: React.FC<SetupWizardContentProps> = ({
  hasSalesChannels,
  hasStockLocations,
  hasRegions,
}) => {
  // Determine initial step based on available data
  const getInitialStep = (): SetupStep => {
    if (!hasSalesChannels) return 'sales-channel-creation';
    if (!hasRegions) return 'region-creation';
    if (!hasStockLocations) return 'stock-location-creation';
    return 'sales-channel-selection';
  };

  const [currentStep, setCurrentStep] = useState<SetupStep>(getInitialStep());
  const [salesChannelId, setSalesChannelId] = useState<string>('');
  const [regionId, setRegionId] = useState<string>('');
  const [stockLocationId, setStockLocationId] = useState<string>('');

  const router = useRouter();
  const updateSettings = useUpdateSettings({
    onSuccess: () => {
      // Se navega al índice, NO a '/products'.
      //
      // Hay tres rutas que definen `products` — (tabs), (doctor) y (nurse) —,
      // así que '/products' es ambiguo y la navegación no resuelve: el
      // asistente se quedaba en la pantalla final con el botón sin efecto
      // aparente, aunque los ajustes sí se habían guardado.
      //
      // El índice ya decide el destino según el rol, que además es lo correcto:
      // un médico no debe aterrizar en la vista de caja.
      router.replace('/');
    },
  });

  const handleSalesChannelComplete = (id: string) => {
    setSalesChannelId(id);
    if (!hasRegions) {
      setCurrentStep('region-creation');
    } else {
      setCurrentStep('region-selection');
    }
  };

  const handleSalesChannelCreateNew = () => {
    setCurrentStep('sales-channel-creation');
  };

  const handleSalesChannelBackToSelection = () => {
    setCurrentStep('sales-channel-selection');
  };

  const handleRegionComplete = (id: string) => {
    setRegionId(id);
    if (!hasStockLocations) {
      setCurrentStep('stock-location-creation');
    } else {
      setCurrentStep('stock-location-selection');
    }
  };

  const handleRegionCreateNew = () => {
    setCurrentStep('region-creation');
  };

  const handleRegionBackToSelection = () => {
    setCurrentStep('region-selection');
  };

  const handleStockLocationComplete = (id: string) => {
    setStockLocationId(id);
    setCurrentStep('welcome');
  };

  const handleStockLocationCreateNew = () => {
    setCurrentStep('stock-location-creation');
  };

  const handleStockLocationBackToSelection = () => {
    setCurrentStep('stock-location-selection');
  };

  const handleWelcomeComplete = async () => {
    updateSettings.mutate({
      sales_channel_id: salesChannelId,
      region_id: regionId,
      stock_location_id: stockLocationId,
    });
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'sales-channel-selection':
        // Only show selection if there are items to select
        if (!hasSalesChannels) {
          return (
            <SalesChannelCreationStep
              onComplete={handleSalesChannelComplete}
              onBackToSelection={handleSalesChannelBackToSelection}
            />
          );
        }
        return (
          <SalesChannelSelectionStep
            onComplete={handleSalesChannelComplete}
            onCreateNew={handleSalesChannelCreateNew}
            initialValue={salesChannelId}
          />
        );
      case 'sales-channel-creation':
        return (
          <SalesChannelCreationStep
            onComplete={handleSalesChannelComplete}
            onBackToSelection={hasSalesChannels ? handleSalesChannelBackToSelection : undefined}
          />
        );
      case 'region-selection':
        // Only show selection if there are items to select
        if (!hasRegions) {
          return (
            <RegionCreationStep onComplete={handleRegionComplete} onBackToSelection={handleRegionBackToSelection} />
          );
        }
        return (
          <RegionSelectionStep
            onComplete={handleRegionComplete}
            onCreateNew={handleRegionCreateNew}
            initialValue={regionId}
          />
        );
      case 'region-creation':
        return (
          <RegionCreationStep
            onComplete={handleRegionComplete}
            onBackToSelection={hasRegions ? handleRegionBackToSelection : undefined}
          />
        );
      case 'stock-location-selection':
        // Only show selection if there are items to select
        if (!hasStockLocations) {
          return (
            <StockLocationCreationStep
              onComplete={handleStockLocationComplete}
              onBackToSelection={handleStockLocationBackToSelection}
            />
          );
        }
        return (
          <StockLocationSelectionStep
            onComplete={handleStockLocationComplete}
            onCreateNew={handleStockLocationCreateNew}
            initialValue={stockLocationId}
          />
        );
      case 'stock-location-creation':
        return (
          <StockLocationCreationStep
            onComplete={handleStockLocationComplete}
            onBackToSelection={hasStockLocations ? handleStockLocationBackToSelection : undefined}
          />
        );
      case 'welcome':
        return <WelcomeStep onComplete={handleWelcomeComplete} isPending={updateSettings.isPending} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView className="flex-1">{renderCurrentStep()}</KeyboardAvoidingView>
    </SafeAreaView>
  );
};
