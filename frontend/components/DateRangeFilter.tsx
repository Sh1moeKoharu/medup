import { ChevronDown } from '@/components/icons/chevron-down';
import { Text } from '@/components/ui/Text';
import { clx } from '@/utils/clx';
import dayjs from 'dayjs';
import React, { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import DatePicker, { DateType } from 'react-native-ui-datepicker';
import { BottomSheet } from './ui/BottomSheet';

interface DateRange {
  startDate: Date | null;
  endDate: Date | null;
}

interface DateRangeFilterProps {
  value: {
    startDate: Date;
    endDate: Date;
  } | null;
  onChange: (
    value: {
      startDate: Date;
      endDate: Date;
    } | null,
  ) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  minDate?: Date;
  maxDate?: Date;
}

export const DateRangeFilter = ({
  value,
  onChange,
  className,
  buttonClassName,
  placeholder = 'Select date range',
  minDate,
  maxDate,
}: DateRangeFilterProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedRange, setSelectedRange] = useState<DateRange>({
    startDate: value?.startDate || null,
    endDate: value?.endDate || null,
  });

  useEffect(() => {
    setSelectedRange({
      startDate: value?.startDate || null,
      endDate: value?.endDate || null,
    });
  }, [value]);

  const formatDateRange = (range: DateRange): string => {
    if (!range.startDate && !range.endDate) return '';

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', {
        dateStyle: 'short',
      });
    };

    if (range.startDate && range.endDate) {
      const start = dayjs(range.startDate).toDate();
      const end = dayjs(range.endDate).toDate();

      return `${formatDate(start)} - ${formatDate(end)}`;
    } else if (range.startDate) {
      const start = dayjs(range.startDate).toDate();
      return `${formatDate(start)} - Select end date`;
    } else if (range.endDate) {
      const end = dayjs(range.endDate).toDate();
      return `Select start date - ${formatDate(end)}`;
    }

    return '';
  };

  const handleDateChange = React.useCallback(
    (params: { startDate: DateType; endDate: DateType }) => {
      const startDate = params.startDate ? dayjs(params.startDate).toDate() : null;
      const endDate = params.endDate ? dayjs(params.endDate).toDate() : null;

      setSelectedRange({ startDate, endDate });

      if (startDate && endDate) {
        onChange({
          startDate,
          endDate,
        });
      } else {
        onChange(null);
      }
    },
    [onChange],
  );

  const displayValue = formatDateRange(value || { startDate: null, endDate: null });

  return (
    <View className={className}>
      <TouchableOpacity
        className={clx(
          'flex-row items-center justify-center gap-2 rounded-full border border-gray-200 bg-white p-3',
          { 'bg-black': displayValue },
          buttonClassName,
        )}
        onPress={() => {
          setSelectedRange({
            startDate: value?.startDate || null,
            endDate: value?.endDate || null,
          });
          setIsVisible(true);
        }}
      >
        <View className={clx({ 'flex-1': displayValue })}>
          <Text
            className={clx({
              'text-white': displayValue,
              'text-lg': !displayValue,
            })}
          >
            {displayValue || placeholder}
          </Text>
        </View>
        <ChevronDown size={24} className={clx('mt-1', { 'text-white': displayValue })} />
      </TouchableOpacity>

      <BottomSheet visible={isVisible} onClose={() => setIsVisible(false)} showCloseButton={false}>
        <DatePicker
          mode="range"
          startDate={selectedRange.startDate}
          endDate={selectedRange.endDate}
          onChange={handleDateChange}
          minDate={minDate}
          maxDate={maxDate}
          className="pb-safe-offset-4 px-4"
          classNames={{
            days: '',
            day_cell: 'p-0.5',
            day: 'group rounded-lg',
            day_label: 'font-normal',
            months: '',
            month: 'group rounded-md active:bg-black',
            month_label: 'group-active:text-white font-normal',
            years: '',
            year: 'group rounded-md active:bg-black',
            year_label: 'group-active:text-white font-normal',
            range_fill: '',
            range_fill_weekstart: '',
            range_fill_weekend: '',
            header: 'mb-1',
            month_selector: '',
            month_selector_label: 'text-lg text-black',
            year_selector: '',
            year_selector_label: 'text-lg text-black',
            time_selector: '',
            time_selector_label: 'text-lg text-black',
            weekdays: '',
            weekday: '',
            weekday_label: 'text-sm uppercase text-black',
            button_next: '',
            button_next_image: '',
            button_prev: '',
            button_prev_image: '',
            time_label: 'text-2xl',
            time_selected_indicator: 'bg-muted rounded-lg',
            range_end: 'bg-black',
            range_end_label: 'text-white',
            range_middle: 'bg-black',
            range_middle_label: 'text-white',
            range_start: 'bg-black',
            range_start_label: 'text-white',
            selected: 'group bg-black active:opacity-90',
            selected_label: 'text-white',
            disabled: '',
            disabled_label: 'text-gray-700 opacity-50',
            hidden: '',
            outside: '',
            outside_label: 'text-gray-700',
            today: 'border-2 border-black',
            today_label: 'text-black',
            selected_month: 'group bg-black active:opacity-90',
            selected_month_label: 'text-white',
            selected_year: 'group bg-black active:opacity-90',
            selected_year_label: 'text-white',
            active_year: 'bg-black',
            active_year_label: 'text-white',
          }}
          showOutsideDays
        />
      </BottomSheet>
    </View>
  );
};
