import * as React from 'react';
import { KeyboardAvoidingViewProps, Platform, KeyboardAvoidingView as RNKeyboardAvoidingView } from 'react-native';

export const KeyboardAvoidingView: React.FC<KeyboardAvoidingViewProps> = (props) => {
  return <RNKeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} {...props} />;
};
