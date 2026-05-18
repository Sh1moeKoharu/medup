import { getProvincesForCountry, hasProvinces } from '@/constants/provinces';
import React from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { SelectField } from './SelectField';

interface ProvinceFieldProps {
  name: string;
  countryFieldName: string;
  placeholder?: string;
  className?: string;
}

export function ProvinceField({
  name,
  countryFieldName,
  placeholder = 'Province/state (optional)',
  className = '',
}: ProvinceFieldProps) {
  const { control } = useFormContext();
  const countryCode = useWatch({ control, name: countryFieldName });

  if (!countryCode) {
    return (
      <SelectField
        name={name}
        floatingPlaceholder
        placeholder="Select a country first"
        options={[]}
        searchable={true}
        className={className}
        isDisabled
      />
    );
  }

  if (!hasProvinces(countryCode)) {
    return (
      <SelectField
        name={name}
        floatingPlaceholder
        placeholder="No provinces available"
        options={[]}
        searchable={true}
        className={className}
        isDisabled
      />
    );
  }

  const provinces = getProvincesForCountry(countryCode);
  const provinceOptions = provinces.map((province) => ({
    label: province.name,
    value: province.code,
  }));

  if (provinceOptions.length === 0) {
    return (
      <SelectField
        name={name}
        floatingPlaceholder
        placeholder="No provinces available"
        options={[]}
        searchable={true}
        className={className}
        isDisabled
      />
    );
  }

  return (
    <SelectField
      name={name}
      floatingPlaceholder
      placeholder={placeholder}
      options={provinceOptions}
      searchable={true}
      className={className}
    />
  );
}

export default ProvinceField;
