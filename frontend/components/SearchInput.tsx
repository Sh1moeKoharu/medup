import { Search } from '@/components/icons/search';
import { clx } from '@/utils/clx';
import { TextInput, View } from 'react-native';

export const SearchInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChangeText, placeholder = 'Buscar...', className }) => {
  return (
    <View className={clx('relative w-full justify-center', className)}>
      <Search size={16} className="absolute left-4 text-gray-400" />
      <TextInput
        className="w-full rounded-full border border-gray-200 py-3 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-active-500"
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        inputMode="search"
        // Un buscador no es prosa: el corrector subraya en rojo apellidos,
        // números de lote y nombres de medicamento, y no ayuda a escribirlos.
        spellCheck={false}
        autoCorrect={false}
      />
    </View>
  );
};
