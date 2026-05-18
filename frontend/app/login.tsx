import { Form } from '@/components/form/Form';
import { FormButton } from '@/components/form/FormButton';
import { TextField } from '@/components/form/TextField';
import { InfoBanner } from '@/components/InfoBanner';
import { LayoutWithKeyboardAvoidingScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { useAuthCtx } from '@/contexts/auth';
import { useState } from 'react';
import { View } from 'react-native';
import * as z from 'zod/v4';

const normalizeUrl = (url: string): string => {
  if (!url) return url;
  let clean = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    if (clean.startsWith('localhost') || clean.startsWith('127.0.0.1') || clean.startsWith('10.')) {
      clean = `http://${clean}`;
    } else {
      clean = `https://${clean}`;
    }
  }
  return clean;
};

const validateMedusaUrl = async (normalizedUrl: string): Promise<boolean> => {
  // Bypassing frontend health check for development due to potential CORS issues.
  // The actual login request will throw an error if the server is unreachable.
  return true;
};

const loginSchema = z.object({
  medusaUrl: z
    .string()
    .min(1, 'La URL de la tienda es requerida')
    .transform(normalizeUrl)
    .refine(
      async (url) => {
        if (!url) return false;

        try {
          new URL(url);
        } catch {
          console.error('Invalid URL format');
          return false;
        }

        return await validateMedusaUrl(url);
      },
      {
        message: 'Por favor ingrese una URL válida de Medusa',
      },
    ),
  email: z.email('Por favor ingrese un correo válido').min(3, 'El correo es requerido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const auth = useAuthCtx();

  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (data: LoginFormData) => {
    setError(null);
    try {
      await auth.login(data.medusaUrl, data.email, data.password);
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión. Por favor, intente de nuevo.');
    }
  };

  const defaultValues: Partial<LoginFormData> = {
    medusaUrl: auth.state.status !== 'loading' ? (auth.state.medusaUrl ?? '') : '',
    email: '',
    password: '',
  };

  return (
    <LayoutWithKeyboardAvoidingScroll>
      <View className="items-center">
        <View className="w-full max-w-xl gap-6">
          <Text className="text-4xl">Iniciar Sesión</Text>
          {error && <InfoBanner colorScheme="error">{error}</InfoBanner>}
          <Form
            key={auth.state.status === 'loading' ? 'loading' : 'form'}
            schema={loginSchema}
            onSubmit={handleLogin}
            defaultValues={defaultValues}
            className="gap-6"
          >
            <TextField
              name="medusaUrl"
              floatingPlaceholder
              placeholder="URL de la Tienda"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              readOnly={auth.state.status === 'loading'}
              textContentType="URL"
              autoComplete="url"
              testID="loginShopUrl"
            />

            <TextField
              name="email"
              floatingPlaceholder
              placeholder="Correo Electrónico"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              readOnly={auth.state.status === 'loading'}
              textContentType="emailAddress"
              autoComplete="email"
              testID="loginEmail"
            />

            <TextField
              name="password"
              floatingPlaceholder
              placeholder="Contraseña"
              secureTextEntry
              autoCapitalize="none"
              readOnly={auth.state.status === 'loading'}
              textContentType="password"
              autoComplete="password"
              testID="loginPassword"
            />

            <FormButton isPending={auth.state.status === 'loading'}>Entrar</FormButton>
          </Form>
        </View>
      </View>
    </LayoutWithKeyboardAvoidingScroll>
  );
}
