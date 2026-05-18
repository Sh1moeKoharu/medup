import { useCurrencies } from '@/api/hooks/currencies';
import { useCreateRegion } from '@/api/hooks/regions';
import { COUNTRIES } from '@/constants/countries';
import { showErrorToast } from '@/utils/errors';
import { AdminRegion } from '@medusajs/types';
import React from 'react';
import * as z from 'zod/v4';
import { Form } from './form/Form';
import { FormButton } from './form/FormButton';
import { MultiSelectField } from './form/MultiSelectField';
import { SelectField } from './form/SelectField';
import { SwitchField } from './form/SwitchField';
import { TextField } from './form/TextField';

interface RegionCreateFormProps {
  onRegionCreated: (region: AdminRegion) => void;
  defaultValues?: Partial<RegionFormData>;
}

const regionSchema = z.object({
  name: z.string().min(1, 'Region name is required'),
  currency_code: z.string().min(1, 'Currency is required'),
  country_codes: z.array(z.string()).optional(),
  automatic_taxes: z.boolean().optional(),
  is_tax_inclusive: z.boolean().optional(),
});

type RegionFormData = z.infer<typeof regionSchema>;

const RegionCreateForm: React.FC<RegionCreateFormProps> = ({
  onRegionCreated,
  defaultValues = {
    country_codes: [],
    automatic_taxes: true,
    is_tax_inclusive: false,
  },
}) => {
  const createRegion = useCreateRegion({
    onSuccess: (data) => {
      onRegionCreated(data.region);
    },
  });
  const currenciesQuery = useCurrencies();

  const handleCreateRegion = (data: RegionFormData) =>
    createRegion
      .mutateAsync({
        name: data.name,
        currency_code: data.currency_code,
        countries: data.country_codes || [],
        automatic_taxes: data.automatic_taxes,
        is_tax_inclusive: data.is_tax_inclusive,
      })
      .catch(() => {});

  const currencyOptions =
    currenciesQuery.data?.pages?.flatMap((page) =>
      page?.currencies?.map((currency) => ({
        label: `${currency.name} (${currency.code.toUpperCase()})`,
        value: currency.code,
      })),
    ) || [];

  const countryOptions = COUNTRIES.map((country) => ({
    label: country.name,
    value: country.alpha2,
  }));

  React.useEffect(() => {
    if (currenciesQuery.isError) {
      showErrorToast(currenciesQuery.error);
    }
  }, [currenciesQuery.error, currenciesQuery.isError]);

  return (
    <Form schema={regionSchema} onSubmit={handleCreateRegion} defaultValues={defaultValues} className="flex-1">
      <TextField name="name" floatingPlaceholder placeholder="Region Name" />

      <SelectField
        name="currency_code"
        floatingPlaceholder
        placeholder="Currency"
        options={currencyOptions}
        searchable
        onEndReached={currenciesQuery.fetchNextPage}
      />

      <MultiSelectField
        name="country_codes"
        floatingPlaceholder
        placeholder="Countries (optional)"
        options={countryOptions}
        searchable
      />

      <SwitchField
        name="automatic_taxes"
        label="Automatic Taxes"
        description="Enable automatic tax calculation for this region"
      />

      <SwitchField
        name="is_tax_inclusive"
        label="Tax Inclusive Pricing"
        description="Prices include taxes (tax-inclusive) vs. taxes added at checkout (tax-exclusive)"
      />

      <FormButton isPending={createRegion.isPending} className="mt-auto">
        Create Region
      </FormButton>
    </Form>
  );
};

export { RegionCreateForm };
