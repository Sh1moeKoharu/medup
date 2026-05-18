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
    label: 'Archived',
    color: 'red',
    icon: Archive,
  },
  canceled: {
    label: 'Canceled',
    color: 'red',
    icon: X,
  },
  completed: {
    label: 'Completed',
    color: 'green',
    icon: CheckCircle,
  },
  draft: {
    label: 'Draft',
    color: 'yellow',
    icon: FilePen,
  },
  pending: {
    label: 'Pending',
    color: 'yellow',
    icon: AlertCircle,
  },
  requires_action: {
    label: 'Requires action',
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
    label: 'Authorized',
    color: 'yellow',
    icon: AlertCircle,
  },
  awaiting: {
    label: 'Awaiting',
    color: 'yellow',
    icon: AlertCircle,
  },
  canceled: {
    label: 'Canceled',
    color: 'red',
    icon: X,
  },
  captured: {
    label: 'Captured',
    color: 'green',
    icon: CheckCircle,
  },
  not_paid: {
    label: 'Not paid',
    color: 'red',
    icon: X,
  },
  partially_authorized: {
    label: 'Partially authorized',
    color: 'yellow',
    icon: AlertCircle,
  },
  partially_captured: {
    label: 'Partially captured',
    color: 'yellow',
    icon: AlertCircle,
  },
  partially_refunded: {
    label: 'Partially refunded',
    color: 'yellow',
    icon: AlertCircle,
  },
  refunded: {
    label: 'Refunded',
    color: 'red',
    icon: X,
  },
  requires_action: {
    label: 'Requires action',
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
    label: 'Not fulfilled',
    color: 'red',
    icon: Package,
  },
  partially_fulfilled: {
    label: 'Partially fulfilled',
    color: 'yellow',
    icon: PackageOpen,
  },
  fulfilled: {
    label: 'Fulfilled',
    color: 'green',
    icon: CheckCircle,
  },
  partially_shipped: {
    label: 'Partially shipped',
    color: 'yellow',
    icon: Truck,
  },
  shipped: {
    label: 'Shipped',
    color: 'green',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    color: 'green',
    icon: Truck,
  },
  partially_delivered: {
    label: 'Partially delivered',
    color: 'yellow',
    icon: Truck,
  },
  canceled: {
    label: 'Canceled',
    color: 'red',
    icon: X,
  },
};

export const OrderListStatus: React.FC<OrderStatusProps> = ({ order, className }) => {
  if (order.status === 'canceled') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-error-200 px-4 py-2', className)}>
        <X size={16} color="#F14747" />
        <Text className="text-sm text-error-500">Canceled</Text>
      </View>
    );
  }

  if (order.status === 'requires_action') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-warning-200 px-4 py-2', className)}>
        <AlertCircle size={16} color="#9B8435" />
        <Text className="text-sm text-warning-500">Requires action</Text>
      </View>
    );
  }

  if (order.status === 'draft') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-active-200 px-4 py-2', className)}>
        <FilePen size={16} color="#4E78E5" />
        <Text className="text-sm text-active-500">Draft</Text>
      </View>
    );
  }

  if (order.status === 'archived') {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-gray-100 px-4 py-2', className)}>
        <Archive size={16} color="#6b7280" />
        <Text className="text-sm text-gray-500">Archived</Text>
      </View>
    );
  }

  const fulfillmentStatus = fulfillmentStatuses[order.fulfillment_status];

  if (!fulfillmentStatus) {
    return (
      <View className={clx('flex-row gap-2 rounded-full bg-gray-100 px-4 py-2', className)}>
        <HelpCircle size={16} color="#6b7280" />
        <Text className="text-sm text-gray-500">Unknown</Text>
      </View>
    );
  }

  const Icon = fulfillmentStatus.icon;

  switch (fulfillmentStatus.color) {
    case 'yellow':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-warning-200 px-4 py-2', className)}>
          <Icon size={16} color="#9B8435" />
          <Text className="text-sm text-warning-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-success-200 px-4 py-2', className)}>
          <Icon size={16} color="#469B3B" />
          <Text className="text-sm text-success-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row gap-2 rounded-full bg-error-200 px-4 py-2', className)}>
          <Icon size={16} color="#F14747" />
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
        <HelpCircle size={14} color="#6b7280" />
        <Text className="text-xs text-gray-500">Unknown</Text>
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
          <Icon size={14} color="#9B8435" />
          <Text className="text-xs text-warning-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color="#469B3B" />
          <Text className="text-xs text-success-500">{fulfillmentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color="#F14747" />
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
        <HelpCircle size={14} color="#6b7280" />
        <Text className="text-xs text-gray-500">Unknown</Text>
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
          <Icon size={14} color="#9B8435" />
          <Text className="text-xs text-warning-500">{paymentStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color="#469B3B" />
          <Text className="text-xs text-success-500">{paymentStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color="#F14747" />
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
        <HelpCircle size={14} color="#6b7280" />
        <Text className="text-xs text-gray-500">Unknown</Text>
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
          <Icon size={14} color="#9B8435" />
          <Text className="text-xs text-warning-500">{orderStatus.label}</Text>
        </View>
      );
    case 'green':
      return (
        <View
          className={clx('flex-row items-center gap-1 rounded-full border border-success-500 px-2 py-1', className)}
        >
          <Icon size={14} color="#469B3B" />
          <Text className="text-xs text-success-500">{orderStatus.label}</Text>
        </View>
      );
    case 'red':
      return (
        <View className={clx('flex-row items-center gap-1 rounded-full border border-error-500 px-2 py-1', className)}>
          <Icon size={14} color="#F14747" />
          <Text className="text-xs text-error-500">{orderStatus.label}</Text>
        </View>
      );
  }
};
