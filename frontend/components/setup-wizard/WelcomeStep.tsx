import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import React from 'react';
import { View } from 'react-native';

interface WelcomeStepProps {
  onComplete: () => void;
  isPending?: boolean;
}

export const WelcomeStep: React.FC<WelcomeStepProps> = ({ onComplete, isPending }) => {
  return (
    <Layout className="pb-6">
      <Text className="mb-6 text-4xl">Bienvenido</Text>
      <Text className="mb-2 text-2xl">Todo listo para comenzar</Text>
      <Text className="mb-6 text-gray-600">
        El punto de venta quedó configurado y listo para usarse. Ya puedes gestionar ventas, productos y pacientes.
      </Text>

      <Text className="mb-4 text-gray-600">Esto es lo que puedes hacer ahora:</Text>
      <Text className="mb-2 text-gray-600">• Consultar el catálogo y armar el carrito</Text>
      <Text className="mb-2 text-gray-600">• Procesar pedidos y cobrar</Text>
      <Text className="mb-2 text-gray-600">• Escanear códigos de barras</Text>
      <Text className="mb-6 text-gray-600">• Dar seguimiento a ventas e inventario</Text>

      <View className="flex-1" />

      <Button onPress={onComplete} isPending={isPending}>
        Comenzar
      </Button>
    </Layout>
  );
};
