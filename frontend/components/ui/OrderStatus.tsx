import { AlertCircle } from '@/components/icons/alert-circle';
import { Archive } from '@/components/icons/archive';
import { CheckCircle } from '@/components/icons/check-circle';
import { FilePen } from '@/components/icons/file-pen';
import { HelpCircle } from '@/components/icons/help-circle';
import { Package } from '@/components/icons/package';
import { PackageOpen } from '@/components/icons/package-open';
import { Truck } from '@/components/icons/truck';
import { X } from '@/components/icons/x';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import { clx } from '@/utils/clx';
import * as MedusaTypes from '@medusajs/types';
import { LucideProps } from 'lucide-react-native';
import { View } from 'react-native';

type OrderStatusProps = {
  order: MedusaTypes.AdminOrder;
  className?: string;
};

const orderStatuses: Record<
  MedusaTypes.OrderStatus | (string & {}),
  {
    label: string;
    color: 'red' | 'yellow' | 'green';
    icon: React.ComponentType<LucideProps>;
  }
> = {
  archived: {
    label: 'Archivada',
    color: 'red',
    icon: Archive,
  },
  canceled: {
    label: 'Cancelada',
    color: 'red',
    icon: X,
  },
  completed: {
    label: 'Completada',
    color: 'green',
    icon: CheckCircle,
  },
  draft: {
    label: 'Borrador',
    color: 'yellow',
    icon: FilePen,
  },
  pending: {
    label: 'Pendiente',
    color: 'yellow',
    icon: AlertCircle,
  },
  requires_action: {
    label: 'Requiere acción',
    color: 'yellow',
    icon: AlertCircle,
  },
};

const paymentStatuses: Record<
  MedusaTypes.PaymentStatus,
  {
    label: string;
    color: 'red' | 'yellow' | 'green';
    icon: React.ComponentType<LucideProps>;
  }
> = {
  authorized: {
    label: 'Autorizado',
    color: 'yellow',
    icon: AlertCircle,
  },
  awaiting: {
    label: 'En espera',
    color: 'yellow',
    icon: AlertCircle,
  },
  canceled: {
    label: 'Cancelado',
    color: 'red',
    icon: X,
  },
  captured: {
    label: 'Cobrado',
    color: 'green',
    icon: CheckCircle,
  },
  not_paid: {
    label: 'Sin pagar',
    color: 'red',
    icon: X,
  },
  partially_authorized: {
    label: 'Autorizado en parte',
    color: 'yellow',
    icon: AlertCircle,
  },
  partially_captured: {
    label: 'Cobrado en parte',
    color: 'yellow',
    icon: AlertCircle,
  },
  partially_refunded: {
    label: 'Reembolsado en parte',
    color: 'yellow',
    icon: AlertCircle,
  },
  refunded: {
    label: 'Reembolsado',
    color: 'red',
    icon: X,
  },
  requires_action: {
    label: 'Requiere acción',
    color: 'yellow',
    icon: AlertCircle,
  },
};

const fulfillmentStatuses: Record<
  MedusaTypes.FulfillmentStatus,
  {
    label: string;
    color: 'red' | 'yellow' | 'green';
    icon: React.ComponentType<LucideProps>;
  }
> = {
  not_fulfilled: {
    label: 'Sin surtir',
    color: 'red',
    icon: Package,
  },
  partially_fulfilled: {
    label: 'Surtida en parte',
    color: 'yellow',
    icon: PackageOpen,
  },
  fulfilled: {
    label: 'Surtida',
    color: 'green',
    icon: CheckCircle,
  },
  partially_shipped: {
    label: 'Enviada en parte',
    color: 'yellow',
    icon: Truck,
  },
  shipped: {
    label: 'Enviada',
    color: 'green',
    icon: Truck,
  },
  delivered: {
    label: 'Entregada',
    color: 'green',
    icon: Truck,
  },
  partially_delivered: {
    label: 'Entregada en parte',
    color: 'yellow',
    icon: Truck,
  },
  canceled: {
    label: 'Cancelada',
    color: 'red',
    icon: X,
  },
};

/**
 * El estado de una orden, en español y en una palabra.
 *
 * Para los sitios que sólo quieren el texto, sin el distintivo con icono. La
 * ficha del paciente pintaba `order.status` en crudo y salía «COMPLETED».
 */
export const etiquetaDeEstado = (estado?: string | null): string =>
  (estado && orderStatuses[estado]?.label) || estado || 'Desconocido';

export const OrderListStatus: React.FC<OrderStatusProps> = ({ order, className }) => {
  if (order.status === 'canceled') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-error-200 px-4 py-2', className)}>
        <X size={16} color={color.iconoError} />
        <Text className="text-sm text-error-500">Cancelada</Text>
      </View>
    );
  }

  if (order.status === 'requires_action') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-warning-200 px-4 py-2', className)}>
        <AlertCircle size={16} color={color.iconoAviso} />
        <Text className="text-sm text-warning-500">Requiere acción</Text>
      </View>
    );
  }

  if (order.status === 'draft') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-active-200 px-4 py-2', className)}>
        <FilePen size={16} color={color.acento} />
        <Text className="text-sm text-active-500">Borrador</Text>
      </View>
    );
  }

  if (order.status === 'archived') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-gray-100 px-4 py-2', className)}>
        <Archive size={16} color={color.iconoNeutro} />
        <Text className="text-sm text-gray-500">Archivada</Text>
      </View>
    );
  }

  const fulfillmentStatus = fulfillmentStatuses[order.fulfillment_status];

  if (!fulfillmentStatus) {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-gray-100 px-4 py-2', className)}>
        <HelpCircle size={16} color={color.iconoNeutro} />
        <Text className="text-sm text-gray-500">Desconocido</Text>
      </View>
    );
  }

  const Icon = fulfillmentStatus.icon;

  switch (fulfillmentStatus.color) {
    case 'yellow':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-warning-200 px-4 py-2', className)}>
          <Icon size={16} color={color.iconoAviso} />
          <Text className="text-sm text-warning-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-success-200 px-4 py-2', className)}>
          <Icon size={16} color={color.iconoExito} />
          <Text className="text-sm text-success-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-error-200 px-4 py-2', className)}>
          <Icon size={16} color={color.iconoError} />
          <Text className="text-sm text-error-500">{fulfillmentStatus.label}</Text>
        </View>
      );
  }
};

export const FulfillmentStatus: React.FC<OrderStatusProps> = ({ order, className }) => {
  const fulfillmentStatus = fulfillmentStatuses[order.fulfillment_status];

  if (!fulfillmentStatus) {
    return (
      <View className={clx('flex-row items-center gap-1 rounded-full border border-gray-500 px-2 py-1', className)}>
        <HelpCircle size={14} color={color.iconoNeutro} />
        <Text className="text-xs text-gray-500">Desconocido</Text>
      </View>
    );
  }

  const Icon = fulfillmentStatus.icon;

  switch (fulfillmentStatus.color) {
    case 'yellow':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-warning-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoAviso} />
          <Text className="text-xs text-warning-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoExito} />
          <Text className="text-xs text-success-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color={color.iconoError} />
          <Text className="text-xs text-error-500">{fulfillmentStatus.label}</Text>
        </View>
      );
  }
};

export const PaymentStatus: React.FC<OrderStatusProps> = ({ order, className }) => {
  const paymentStatus = paymentStatuses[order.payment_status];

  if (!paymentStatus) {
    return (
      <View className={clx('flex-row items-center gap-1 rounded-full border border-gray-500 px-2 py-1', className)}>
        <HelpCircle size={14} color={color.iconoNeutro} />
        <Text className="text-xs text-gray-500">Desconocido</Text>
      </View>
    );
  }

  const Icon = paymentStatus.icon;

  switch (paymentStatus.color) {
    case 'yellow':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-warning-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoAviso} />
          <Text className="text-xs text-warning-500">{paymentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoExito} />
          <Text className="text-xs text-success-500">{paymentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color={color.iconoError} />
          <Text className="text-xs text-error-500">{paymentStatus.label}</Text>
        </View>
      );
  }
};

export const OrderStatus: React.FC<OrderStatusProps> = ({ order, className }) => {
  const orderStatus = orderStatuses[order.status];

  if (!orderStatus) {
    return (
      <View className={clx('flex-row items-center gap-1 rounded-full border border-gray-500 px-2 py-1', className)}>
        <HelpCircle size={14} color={color.iconoNeutro} />
        <Text className="text-xs text-gray-500">Desconocido</Text>
      </View>
    );
  }

  const Icon = orderStatus.icon;

  switch (orderStatus.color) {
    case 'yellow':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-warning-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoAviso} />
          <Text className="text-xs text-warning-500">{orderStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color={color.iconoExito} />
          <Text className="text-xs text-success-500">{orderStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color={color.iconoError} />
          <Text className="text-xs text-error-500">{orderStatus.label}</Text>
        </View>
      );
  }
};
