import { Form } from '@/components/form/Form';
import { FormButton } from '@/components/form/FormButton';
import { TextField } from '@/components/form/TextField';
import { InfoBanner } from '@/components/InfoBanner';
import { LayoutWithKeyboardAvoidingScroll } from '@/components/ui/Layout';
import { Text } from '@/components/ui/Text';
import { ROLES, normalizeRole } from '@/constants/roles';
import { leerApiKey, useAuthCtx } from '@/contexts/auth';
import { resolverUrlServidor } from '@/utils/origen';
import { irAlPanel } from '@/utils/panel';
import { aIdentificador } from '@/utils/usuario';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Platform, TouchableOpacity, View } from 'react-native';
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
  // Se entra con NOMBRE DE USUARIO. Aquí no se valida la forma: quien todavía
  // no esté migrado entra con su correo completo, y las dos cosas son válidas.
  // Lo que decide es el servidor, y su respuesta ya se enseña traducida.
  email: z.string().min(3, 'Escribe tu usuario'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

type LoginFormData = z.infer<typeof loginSchema>;

/**
 * La dirección del servidor, escondida hasta que hace falta.
 *
 * ── POR QUÉ NO ES UN CAMPO MÁS ──────────────────────────────────────────────
 * Era el PRIMERO de los tres, y el más prominente, lo que hacía que la pantalla
 * pareciera un formulario de configuración en vez de un inicio de sesión. Pero
 * es un dato que un cajero no debe tocar nunca: en producción se deduce sola
 * del origen de la página, porque nginx sirve el punto de venta y la API desde
 * la misma dirección. Sólo hace falta escribirla en desarrollo, donde el POS
 * corre en otro puerto que el backend.
 *
 * Así que se muestra como una nota al pie con la máquina a la que se va a
 * conectar —que es lo único que alguien necesita comprobar de un vistazo— y el
 * campo aparece al pulsar «Cambiar».
 *
 * Se abre solo si la dirección no vale: si no, el formulario no dejaría entrar
 * y el motivo estaría escondido.
 */
function DireccionDelServidor({ cargando }: { cargando: boolean }) {
  const [abiertoAMano, setAbiertoAMano] = useState(false);
  const { formState } = useFormContext();
  const url = useWatch({ name: 'medusaUrl' }) as string | undefined;

  const abierto = abiertoAMano || !!formState.errors.medusaUrl;

  if (abierto) {
    return (
      <TextField
        name="medusaUrl"
        floatingPlaceholder
        placeholder="Dirección del servidor"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        readOnly={cargando}
        textContentType="URL"
        autoComplete="url"
        testID="loginShopUrl"
      />
    );
  }

  let maquina = url ?? '';
  try {
    if (url) maquina = new URL(url).host;
  } catch {
    // Se queda con el texto tal cual: si no es una URL válida, el formulario ya
    // va a abrir el campo por su cuenta.
  }

  return (
    <View className="flex-row flex-wrap items-center justify-center gap-x-2">
      <Text className="text-xs text-gray-400">
        Servidor: {maquina || 'sin definir'}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Cambiar la dirección del servidor"
        className="min-h-toque justify-center px-1"
        onPress={() => setAbiertoAMano(true)}
      >
        <Text className="text-xs text-active-500">Cambiar</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LoginScreen() {
  const auth = useAuthCtx();

  const [error, setError] = useState<string | null>(null);

  /**
   * Administración entra directa al PANEL, no al punto de venta.
   *
   * ── POR QUÉ ─────────────────────────────────────────────────────────────
   * Su trabajo —configuración, personal, autorizaciones, reportes— vive
   * entero allá. Aterrizar en la caja registradora y tener que dar otro paso
   * era el orden equivocado para el único perfil que casi nunca cobra.
   *
   * ── POR QUÉ SÓLO AL ENTRAR, Y NO SIEMPRE ────────────────────────────────
   * Si el salto se hiciera en cada arranque, Administración no podría usar el
   * punto de venta NUNCA: al pulsar «Punto de venta» desde el panel llegaría
   * aquí con la sesión ya abierta y se la devolvería al panel, en bucle.
   *
   * Haciéndolo sólo tras un inicio de sesión, el que entra va al panel y el
   * que llega desde el panel se queda donde quiso ir. Sigue teniendo acceso a
   * todo; lo que cambia es por dónde empieza.
   */
  const handleLogin = async (data: LoginFormData) => {
    setError(null);
    try {
      const rol = await auth.login(data.medusaUrl, aIdentificador(data.email), data.password);

      if (normalizeRole(rol) === ROLES.ADMIN) {
        await irAlPanel(data.medusaUrl, (await leerApiKey()) ?? '');
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión. Por favor, intente de nuevo.');
    }
  };

  // La dirección del servidor, por orden de preferencia.
  //
  // ── POR QUÉ EL ORIGEN DE LA PROPIA PÁGINA VA PRIMERO ────────────────────
  // Nginx sirve el POS y la API en el MISMO origen: el punto de venta en la
  // raíz y /admin, /auth y /store reenviados al backend. Eso significa que la
  // dirección desde la que se abrió esta página YA ES la dirección correcta
  // del servidor, siempre, sin excepción.
  //
  // Antes se tomaba de EXPO_PUBLIC_MEDUSA_API_URL, horneada al compilar, que
  // en el repositorio vale http://localhost:9000 — o sea, el propio dispositivo
  // del cajero, no el servidor. Había que teclear la dirección a mano en cada
  // tableta.
  //
  // Peor aún de cara a la mudanza: una dirección fija se rompe en cuanto el
  // servidor cambia de red y recibe otra IP, y habría que volver a apuntar
  // dispositivo por dispositivo. Deducirla del origen hace que siga
  // funcionando con cualquier IP, y también más adelante con un nombre de
  // dominio o con https.
  //
  // ── LOS DOS CASOS RAROS VIVEN EN utils/origen.ts ───────────────────────
  // Uno lo trajo la rama de despliegue: una dirección guardada con http dentro
  // de una página https la BLOQUEA el navegador, y el día que el servidor pase
  // a https todas las tabletas que ya entraron dejarían de funcionar a la vez.
  //
  // El otro es de desarrollo: sin nada guardado, el origen es el 8081, que es
  // el servidor de Expo y no el backend. Daba un 404 que en pantalla se leía
  // como «No se encontró lo que se pedía» y hacía mirar la contraseña.
  //
  // Los dos son la misma pregunta —con qué dirección hablar— y se responden en
  // un solo sitio.

  const defaultValues: Partial<LoginFormData> = {
    medusaUrl:
      auth.state.status !== 'loading'
        ? resolverUrlServidor(auth.state.medusaUrl)
        : '',
    email: '',
    password: '',
  };

  const cargando = auth.state.status === 'loading';

  /*
   * ── LA COMPOSICIÓN ─────────────────────────────────────────────────────────
   * Antes eran tres campos y un botón alineados a la izquierda, arriba del todo
   * de una pantalla vacía: se veía como el formulario de configuración de una
   * herramienta, no como la puerta de entrada del software de una clínica.
   *
   * Ahora la tarjeta blanca se centra sobre el lienzo crema. Es el principio 1
   * del sistema hecho pantalla: como el lienzo está un punto por debajo del
   * blanco, la tarjeta se separa sola y no necesita borde, sólo la sombra más
   * suave de las tres. La marca va encima en peso ligero, que es de donde el
   * sistema saca la jerarquía, y no en negrita ni en grande.
   *
   * La medida baja de 576 a 384 px. Un formulario de dos campos estirado a lo
   * ancho de una tableta se lee peor, no mejor.
   */
  return (
    <LayoutWithKeyboardAvoidingScroll
      // El centrado va por `style` y no por clase: `contentContainerClassName`
      // lo traduce NativeWind sobre el ScrollView de
      // react-native-keyboard-controller, y ahí no llegó a aplicarse. Se
      // comprobó sobre la página: el contenedor no tenía ni `flex-grow` ni
      // `justify-content`.
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View className="items-center">
        <View className="w-full max-w-sm">
          <View className="mb-7 items-center">
            <Text className="text-4xl">Altus</Text>
            <Text className="mt-1 text-sm text-gray-400">Punto de venta de la clínica</Text>
          </View>

          <Form
            key={cargando ? 'loading' : 'form'}
            schema={loginSchema}
            onSubmit={handleLogin}
            defaultValues={defaultValues}
            className="gap-5"
          >
            <View className="rounded-2xl bg-white p-6 shadow-card">
              <Text className="mb-5 text-sm text-gray-400">Iniciar sesión</Text>

              {error && <InfoBanner colorScheme="error" className="mb-4">{error}</InfoBanner>}

              <View className="gap-4">
                <TextField
                  name="email"
                  floatingPlaceholder
                  placeholder="Usuario"
                  autoCapitalize="none"
                  autoCorrect={false}
                  readOnly={cargando}
                  textContentType="username"
                  autoComplete="username"
                  testID="loginEmail"
                />

                <TextField
                  name="password"
                  floatingPlaceholder
                  placeholder="Contraseña"
                  secureTextEntry
                  autoCapitalize="none"
                  readOnly={cargando}
                  textContentType="password"
                  autoComplete="password"
                  testID="loginPassword"
                />
              </View>

              <FormButton className="mt-6" isPending={cargando}>
                Entrar
              </FormButton>
            </View>

            <DireccionDelServidor cargando={cargando} />
          </Form>
        </View>
      </View>
    </LayoutWithKeyboardAvoidingScroll>
  );
}
