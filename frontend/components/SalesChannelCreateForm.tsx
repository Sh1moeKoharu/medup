import { useCreateSalesChannel } from '@/api/hooks/sales-channel';
import { AdminSalesChannel } from '@medusajs/types';
import React from 'react';
import * as z from 'zod/v4';
import { Form } from './form/Form';
import { FormButton } from './form/FormButton';
import { TextField } from './form/TextField';

interface SalesChannelCreateFormProps {
  onSalesChannelCreated: (salesChannel: AdminSalesChannel) => void;
  defaultValues?: Partial<SalesChannelFormData>;
}

const salesChannelSchema = z.object({
  name: z.string().min(1, 'Sales channel name is required'),
  description: z.string().optional(),
});

type SalesChannelFormData = z.infer<typeof salesChannelSchema>;

const SalesChannelCreateForm: React.FC<SalesChannelCreateFormProps> = ({
  onSalesChannelCreated,
  defaultValues = {
    description: 'Created via Agilo POS',
  },
}) => {
  const createSalesChannel = useCreateSalesChannel({
    onSuccess: (data) => {
      onSalesChannelCreated(data.sales_channel);
    },
  });

  const handleCreateSalesChannel = (data: SalesChannelFormData) =>
    createSalesChannel
      .mutateAsync({
        name: data.name,
        description: data.description,
      })
      .catch(() => {});

  return (
    <Form
      schema={salesChannelSchema}
      onSubmit={handleCreateSalesChannel}
      defaultValues={defaultValues}
      className="flex-1"
    >
      <TextField name="name" floatingPlaceholder placeholder="Channel Name" />

      <TextField
        name="description"
        floatingPlaceholder
        placeholder="Description (optional)"
        multiline
        numberOfLines={3}
      />

      <FormButton isPending={createSalesChannel.isPending} className="mt-auto">
        Create Channel
      </FormButton>
    </Form>
  );
};

export { SalesChannelCreateForm };
