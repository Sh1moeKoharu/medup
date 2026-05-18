import { useScanBarcode } from '@/api/hooks/products';
import { X } from '@/components/icons/x';
import { Zap } from '@/components/icons/zap';
import { ZapOff } from '@/components/icons/zap-off';
import { Text } from '@/components/ui/Text';
import { BarcodeScanningResult, Camera, CameraView } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, usePathname } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ScanScreen() {
  const pathname = usePathname();
  const scannedBarcodeRef = React.useRef<false | string>(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [enableTorch, setEnableTorch] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scanBarcodeMutation = useScanBarcode({
    onMutate: () => {
      setErrorMessage(null);
    },
    onSuccess: (data) => {
      if (data) {
        router.push({
          pathname: '/product-details',
          params: {
            productId: data.product.id,
            productName: data.product.title,
          },
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setErrorMessage('Producto no encontrado');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
  });

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    };

    getCameraPermissions();
  }, []);

  const toggleTorch = React.useCallback(() => {
    setEnableTorch((current) => !current);
  }, []);

  const handleBarcodeScanned = React.useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (
        scanBarcodeMutation.isPending ||
        pathname !== '/scan' // Prevent scanning if not on the scan page
      ) {
        return;
      }

      // Prevent multiple scans
      if (scannedBarcodeRef.current === data) {
        return;
      }
      scannedBarcodeRef.current = data;

      scanBarcodeMutation.mutate(data, {
        onSuccess: (res) => {
          if (res) {
            setTimeout(() => {
              scannedBarcodeRef.current = false;
            }, 1000);
          }
        },
      });
    },
    [scanBarcodeMutation, pathname],
  );

  const handleGoBack = React.useCallback(() => {
    router.back();
  }, []);

  if (hasPermission === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="white" />
        <Text className="mt-4 text-white">Solicitando permisos de cámara...</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-black p-5">
        <Text className="mb-4 text-center text-2xl text-white">Acceso a cámara requerido</Text>
        <Text className="mb-8 text-center text-white opacity-70">
          Por favor habilita el acceso a la cámara en los ajustes para escanear
        </Text>
        <TouchableOpacity className="items-center rounded-lg border border-white p-4" onPress={handleGoBack}>
          <Text className="text-white">Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View className="relative flex-1 bg-black">
      {/* Camera View - Full Screen */}
      <CameraView
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        facing="back"
        enableTorch={enableTorch}
        onBarcodeScanned={handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code93', 'code39'],
        }}
        autofocus="on"
        active={pathname === '/scan'}
      />

      {/* Top Navigation with Safe Area */}
      <View className="py-safe-offset-3 absolute left-0 right-0 top-0 z-30 flex-row items-center justify-between px-6">
        <TouchableOpacity className="h-12 w-12 items-center justify-center" onPress={handleGoBack}>
          <X size={32} color="white" />
        </TouchableOpacity>

        <TouchableOpacity className="h-12 w-12 items-center justify-center" onPress={toggleTorch}>
          {enableTorch ? <Zap size={26} color="white" /> : <ZapOff size={26} color="white" />}
        </TouchableOpacity>
      </View>

      {/* Center Reticle Overlay */}
      <View className="relative flex-1 items-center justify-center px-8">
        <View className="items-center">
          {/* Reticle Frame */}
          <View className="relative h-64 w-64">
            {/* Corner brackets */}
            <View className="absolute bottom-[3px] left-[3px] right-[3px] top-[3px] rounded-[29px] bg-[#ffffff4d]" />
            <View className="absolute left-0 top-0 h-20 w-20 rounded-tl-[32px] border-l-[3px] border-t-[3px] border-white" />
            <View className="absolute right-0 top-0 h-20 w-20 rounded-tr-[32px] border-r-[3px] border-t-[3px] border-white" />
            <View className="absolute bottom-0 left-0 h-20 w-20 rounded-bl-[32px] border-b-[3px] border-l-[3px] border-white" />
            <View className="absolute bottom-0 right-0 h-20 w-20 rounded-br-[32px] border-b-[3px] border-r-[3px] border-white" />

            {/* Loading indicator when searching */}
            {scanBarcodeMutation.isPending && (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                className="absolute inset-0 items-center justify-center"
              >
                <ActivityIndicator size="large" color="white" />
              </Animated.View>
            )}
          </View>

          {/* Scan Text */}
          {!scanBarcodeMutation.isPending && (
            <Animated.View entering={FadeIn} exiting={FadeOut} className="absolute top-full mt-6">
              <Text className="text-center text-xl text-white">Escanear código de barras</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Bottom Searching Indicator with Safe Area */}
      {scanBarcodeMutation.isPending && (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="pb-safe-offset-4 absolute bottom-0 left-0 right-0 flex items-center px-6"
        >
          <View className="rounded-3xl bg-white px-4 py-2">
            <Text className="text-center">Buscando...</Text>
          </View>
        </Animated.View>
      )}

      {!scanBarcodeMutation.isPending && errorMessage && (
        <Animated.View
          entering={FadeIn}
          exiting={FadeOut}
          className="pb-safe-offset-4 absolute bottom-0 left-0 right-0 z-50 flex items-center px-6"
        >
          <TouchableOpacity
            className="rounded-3xl bg-error-500 px-4 py-2"
            onPress={() => {
              setErrorMessage(null);
              scanBarcodeMutation.reset();
            }}
          >
            <Text className="text-center text-white">{errorMessage}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}
