import { useCreateStockLocation } from '@/api/hooks/stock-location';
import { ProvinceField } from '@/components/form/ProvinceField';
import { COUNTRIES, getCountryName } from '@/constants/countries';
import { AdminStockLocation } from '@medusajs/types';
import React from 'react';
import * as z from 'zod/v4';
import { Form } from './form/Form';
import { FormButton } from './form/FormButton';
import { SelectField } from './form/SelectField';
import { TextField } from './form/TextField';

interface StockLocationCreateFormProps {
  onStockLocationCreated: (stockLocation: AdminStockLocation) => void;
  defaultValues?: Partial<StockLocationFormData>;
}

const stockLocationSchema = z.object({
  name: z.string().min(1, 'El nombre de la ubicación es requerido'),
  address_1: z.string().min(1, 'La dirección es requerida'),
  address_2: z.string().optional(),
  city: z.string().optional(),
  country_code: z.string().min(1, 'El país es requerido'),
  province: z.string().optional(),
  postal_code: z.string().optional(),
});

type StockLocationFormData = z.infer<typeof stockLocationSchema>;

const StockLocationCreateForm: React.FC<StockLocationCreateFormProps> = ({ onStockLocationCreated, defaultValues }) => {
  const createStockLocation = useCreateStockLocation({
    onSuccess: (data) => {
      onStockLocationCreated(data.stock_location);
    },
  });

  const countryOptions = COUNTRIES.map((country) => ({
    label: getCountryName(country),
    value: country.alpha2,
  }));

  const handleCreateStockLocation = (data: StockLocationFormData) =>
    createStockLocation
      .mutateAsync({
        name: data.name,
        address: {
          address_1: data.address_1,
          address_2: data.address_2 || '',
          city: data.city || '',
          country_code: data.country_code,
          province: data.province || '',
          postal_code: data.postal_code || '',
        },
      })
      .catch(() => {});

  return (
    <Form
      schema={stockLocationSchema}
      onSubmit={handleCreateStockLocation}
      defaultValues={
        defaultValues
          ? {
              name: defaultValues.name || '',
              address_1: defaultValues.address_1 || '',
              address_2: defaultValues.address_2 || '',
              city: defaultValues.city || '',
              country_code: defaultValues.country_code || '',
              province: defaultValues.province || '',
              postal_code: defaultValues.postal_code || '',
            }
          : undefined
      }
    >
      <TextField name="name" floatingPlaceholder placeholder="Nombre de la ubicación" />

      <TextField name="company" floatingPlaceholder placeholder="Empresa (opcional)" />

      <TextField name="phone" floatingPlaceholder placeholder="Phone (optional)" />

      <TextField name="address_1" floatingPlaceholder placeholder="Address Line 1" />

      <TextField name="address_2" floatingPlaceholder placeholder="Address Line 2 (optional)" />

      <TextField name="postal_code" floatingPlaceholder placeholder="Postal Code (optional)" />

      <TextField name="city" floatingPlaceholder placeholder="City (optional)" />

      <SelectField
        floatingPlaceholder
        name="country_code"
        placeholder="Country"
        options={countryOptions}
        searchable={true}
        className="mb-2"
      />

      <ProvinceField name="province" countryFieldName="country_code" placeholder="Province/State (optional)" />

      <FormButton isPending={createStockLocation.isPending}>Crear ubicación de inventario</FormButton>
    </Form>
  );
};

export { StockLocationCreateForm };
