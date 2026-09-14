import { Button } from '@/components/ui/Button';
import { Dialog, DialogProps } from '@/components/ui/Dialog';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';


/**
 * `description` no estaba, y los carritos de médico y enfermería SÍ lo pasaban.
 * TypeScript lo marcaba y React lo descartaba en silencio: el diálogo de
 * confirmación mostraba el título y **perdía el texto que explica qué se va a
 * confirmar**. No era cosmético; era información que el usuario no veía.
 *
 * Vive aquí y no en `Dialog` porque es propio de un diálogo de confirmación:
 * decir qué se pregunta, encima de los dos botones que la responden.
 */
type PromptProps = {
  onSubmit: () => void;
  description?: string;
  submitText?: string;
  cancelText?: string;
} & DialogProps;

export const Prompt: React.FC<PromptProps> = ({
  onSubmit,
  onClose,
  description,
  submitText = 'Sí',
  cancelText = 'No',
  ...props
}) => {
  return (
    <Dialog {...props} onClose={onClose} containerClassName="max-w-md">
      {description ? <Text className="mb-4 text-gray-500">{description}</Text> : null}
      <View className="flex-row gap-2">
        <Button onPress={onSubmit} className="flex-1">
          {submitText}
        </Button>
        <Button variant="outline" onPress={onClose} className="flex-1">
          {cancelText}
        </Button>
      </View>
    </Dialog>
  );
};
