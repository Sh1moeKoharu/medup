import { clx } from '@/utils/clx';
import { Platform, ScrollView, ScrollViewProps, View, ViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
  KeyboardToolbar,
} from 'react-native-keyboard-controller';

export const Layout: React.FC<ViewProps> = ({ className, ...props }) => {
  return <View className={clx('px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6 flex-1 bg-white', className)} {...props} />;
};

export const LayoutWithScroll: React.FC<ScrollViewProps> = (props) => {
  return (
    <View className="relative flex-1 bg-white">
      <View className="pt-safe absolute left-0 right-0 top-0 z-10 bg-white" />
      <ScrollView
        {...props}
        className={clx('flex-1', props.className)}
        contentContainerClassName={clx('px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6', props.contentContainerClassName)}
      >
        {props.children}
      </ScrollView>
    </View>
  );
};

export const LayoutWithKeyboardAvoidingScroll: React.FC<KeyboardAwareScrollViewProps> = (props) => {
  return (
    <View className="relative flex-1 bg-white">
      <View className="pt-safe absolute left-0 right-0 top-0 z-10 bg-white" />
      <KeyboardAwareScrollView
        {...props}
        bottomOffset={Platform.OS === 'android' ? 45 : 76}
        className={clx('flex-1', props.className)}
        contentContainerClassName={clx(
          'px-safe-offset-4 md:px-8 lg:px-16 xl:px-32 pt-safe-offset-6 pb-6 bg-white',
          props.contentContainerClassName,
        )}
      >
        {props.children}
      </KeyboardAwareScrollView>
      <KeyboardToolbar />
    </View>
  );
};
