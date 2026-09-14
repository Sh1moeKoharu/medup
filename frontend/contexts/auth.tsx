import { isNotFoundError, isUnauthorizedError, mensajeDeError } from '@/utils/errors';
import { INTERVALO_REVISION_MS, cerrarSesionDelPanel, leerSalida, marcarSalida } from '@/utils/sesion-compartida';
import { resolverUrlServidor } from '@/utils/origen';
import Medusa from '@medusajs/js-sdk';
import * as SecureStore from 'expo-secure-store';
import * as React from 'react';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';

const setStorageItemAsync = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Local storage is unavailable:', e);
    }
  } else {
    await SecureStore.setItemAsync(key, value);
  }
};

const getStorageItemAsync = async (key: string) => {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error('Local storage is unavailable:', e);
      return null;
    }
  } else {
    return await SecureStore.getItemAsync(key);
  }
};

const deleteStorageItemAsync = async (key: string) => {
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error('Local storage is unavailable:', e);
    }
  } else {
    await SecureStore.deleteItemAsync(key);
  }
};

/**
 * El token de la sesión abierta.
 *
 * Lo necesita la pantalla de acceso justo después de entrar, para abrir de paso
 * la sesión del panel. Leerlo del estado ahí no sirve: acaba de esperar a
 * `login` y el estado todavía es el viejo.
 */
export const leerApiKey = (): Promise<string | null> => getStorageItemAsync('apiKey');

export type AuthStateType =
  | {
    status: 'loading';
  }
  | {
    status: 'unauthenticated';
    medusaUrl?: string;
    userEmail?: string;
  }
  | {
    status: 'authenticated';
    user: {
      id: string;
      name: string;
      email: string;
      role?: string;
    };
    medusaUrl: string;
    userEmail: string;
    apiKey: string;
  };

export type AuthContextType = {
  state: AuthStateType;
  /**
   * Devuelve el ROL con el que entró, o `undefined` si no se pudo entrar.
   *
   * No lanza: los fallos se enseñan en un aviso desde aquí dentro. Se devuelve
   * el rol porque la pantalla de acceso decide a dónde llevar a cada perfil, y
   * leerlo del estado justo después de esperar da el valor viejo.
   */
  login: (medusaUrl: string, email: string, password: string) => Promise<string | undefined>;
  logout: () => Promise<void>;
};

export const AuthContext = React.createContext<AuthContextType>({
  state: { status: 'loading' },
  login: async () => {
    throw new Error('login function not implemented');
  },
  logout: async () => {
    throw new Error('logout function not implemented');
  },
});

/**
 * Rol del usuario, tal como lo guarda el backend en `user.metadata.role`.
 *
 * ── POR QUÉ EXISTE ESTA FUNCIÓN ─────────────────────────────────────────────
 * Antes esto estaba duplicado —inicio de sesión y restauración de sesión— y
 * AMBAS copias pedían `fields: '*metadata'`.
 *
 * Ese `*` es la sintaxis para EXPANDIR UNA RELACIÓN, y `metadata` no es una
 * relación: es una columna JSON. La petición devuelve 200 y un usuario SIN
 * `metadata`, así que `role` quedaba `undefined` — y el `catch` nunca saltaba,
 * porque no hubo ningún error que capturar. Un fallo perfectamente silencioso.
 *
 * Consecuencia: NINGÚN usuario tenía rol dentro del punto de venta. Mientras el
 * destino por omisión fue la caja registradora, eso mandaba a todo el mundo a
 * cobrar —que es justo lo que reportó el tester: "todos entran a la vista del
 * POS"—. Al cambiar el valor por omisión a `/sin-pos`, el síntoma se invirtió y
 * pasó a echar a todos, incluido el cajero. La causa era la misma.
 *
 * `/admin/users/me` YA devuelve `metadata`, así que la segunda petición sobra.
 * Se conserva sólo como respaldo, ahora con la sintaxis correcta.
 *
 * Comprobado contra el backend:
 *   fields=*metadata -> metadata ausente   (200, sin error)
 *   fields=+metadata -> {"role":"cashier"}
 */
const resolverRol = async (
  sdk: Medusa,
  usuario: { id: string; metadata?: unknown },
  headers?: Record<string, string>,
): Promise<string | undefined> => {
  const deSesion = (usuario as any)?.metadata?.role;
  if (deSesion) {
    return deSesion;
  }

  try {
    const completo = await sdk.admin.user.retrieve(
      usuario.id,
      { fields: '+metadata' } as any,
      headers,
    );
    return (completo.user as any).metadata?.role;
  } catch (e) {
    console.warn('No se pudo leer el rol del usuario:', e);
    return undefined;
  }
};

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = React.useState<AuthStateType>({
    status: 'loading',
  });

  const login = React.useCallback(
    async (medusaUrl: string, email: string, password: string) => {
      if (state.status === 'authenticated') {
        throw new Error('User is already authenticated');
      }

      try {
        const sdk = new Medusa({
          baseUrl: medusaUrl,
          debug: false,
          auth: {
            type: 'jwt',
            jwtTokenStorageMethod: 'nostore',
          },
        });

        const loginResponse = await sdk.auth.login('user', 'emailpass', {
          email,
          password,
        });

        if (typeof loginResponse !== 'string') {
          throw new Error('Handle this redirect later');
        }

        const apiKey = loginResponse;

        const userResponse = await sdk.admin.user.me(undefined, {
          Authorization: `Bearer ${apiKey}`,
        });

        const role = await resolverRol(sdk, userResponse.user as any, {
          Authorization: `Bearer ${apiKey}`,
        });

        await setStorageItemAsync('medusaUrl', medusaUrl);
        await setStorageItemAsync('userEmail', email);
        await setStorageItemAsync('apiKey', apiKey);
        // Desde cuándo hay sesión: una salida marcada antes (en el panel o aquí)
        // no debe cerrar esta. Ver utils/sesion-compartida.ts.
        await setStorageItemAsync('sesionDesde', String(Date.now()));

        setState({
          status: 'authenticated',
          user: {
            id: userResponse.user.id,
            name:
              [userResponse.user.first_name, userResponse.user.last_name].filter(Boolean).join(' ') ||
              userResponse.user.email.split('@')[0],
            email: userResponse.user.email,
            role,
          },
          userEmail: email,
          medusaUrl,
          apiKey,
        });

        return role;
      } catch (error) {
        console.error('Login failed:', error);

        if (isUnauthorizedError(error)) {
          // Un 401 no siempre es una contraseña mal escrita: la cuenta puede
          // estar BLOQUEADA por Administración (backend/src/lib/bloqueo.ts),
          // y el servidor lo dice en el mensaje. Decir «contraseña incorrecta»
          // en ese caso manda a la persona a reintentar su clave para nada.
          const mensaje = String((error as { message?: unknown })?.message ?? '');
          const bloqueada = /bloquead/i.test(mensaje);
          Toast.show({
            type: 'error',
            text1: bloqueada ? 'Cuenta bloqueada' : 'No se pudo entrar',
            text2: bloqueada ? mensaje : 'El usuario o la contraseña no son correctos.',
            visibilityTime: 5000,
          });
        } else if (isNotFoundError(error)) {
          // Un 404 en la ruta de acceso no significa «no existe esa cuenta»:
          // significa que en esa dirección no hay un servidor Altus. Decir
          // sólo «no se encontró lo que se pedía» dejaba mirando la contraseña
          // cuando lo que estaba mal era el servidor.
          Toast.show({
            type: 'error',
            text1: 'No hay un servidor Altus ahí',
            text2: `${medusaUrl} respondió, pero no es el servidor. Pulsa «Cambiar» y revisa la dirección.`,
            visibilityTime: 7000,
          });
        } else {
          Toast.show({
            type: 'error',
            text1: 'No se pudo entrar',
            text2: mensajeDeError(error),
            visibilityTime: 4000,
          });
        }

        return undefined;
      }
    },
    [state.status],
  );

  const logout = React.useCallback(async () => {
    if (state.status !== 'authenticated') {
      throw new Error('User is not authenticated');
    }

    // Salir de aquí cierra también el panel en este navegador: se marca la
    // salida y se borra la sesión del panel en el servidor.
    marcarSalida();
    void cerrarSesionDelPanel(state.medusaUrl);

    await deleteStorageItemAsync('apiKey');
    await deleteStorageItemAsync('sesionDesde');
    setState({ status: 'unauthenticated' });
  }, [state]);

  /**
   * Si se salió del panel después de entrar aquí, se sale también. Se revisa
   * cada poco y al volver a la pestaña, que es cuando se nota.
   *
   * No se vuelve a marcar la salida ni se llama al servidor: eso ya lo hizo
   * quien salió, y repetirlo sólo movería la hora de la señal.
   */
  const estaAutenticado = state.status === 'authenticated';
  React.useEffect(() => {
    if (!estaAutenticado || Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    let saliendo = false;
    const revisar = async () => {
      if (saliendo) return;
      const desde = Number(await getStorageItemAsync('sesionDesde')) || 0;
      if (leerSalida() > desde) {
        saliendo = true;
        await deleteStorageItemAsync('apiKey');
        await deleteStorageItemAsync('sesionDesde');
        setState({ status: 'unauthenticated' });
      }
    };

    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS);
    const alVolver = () => {
      if (!document.hidden) void revisar();
    };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', alVolver);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', alVolver);
    };
  }, [estaAutenticado]);

  React.useEffect(() => {
    let cancelled = false;

    const loadAuthState = async () => {
      try {
        // Si el servidor pasó a https, la dirección guardada con http la
        // bloquearía el navegador. Ver utils/origen.ts.
        const medusaUrl = resolverUrlServidor(await getStorageItemAsync('medusaUrl'));
        const userEmail = await getStorageItemAsync('userEmail');
        let apiKey = await getStorageItemAsync('apiKey');

        // Con el punto de venta cerrado no se vigila nada: si mientras tanto se
        // salió del panel, el token guardado ya no vale en este navegador.
        //
        // Una sesión abierta antes de existir esto no tiene `sesionDesde`. Se
        // le pone la hora de ahora en vez de cerrarla, para que actualizar no
        // saque a nadie.
        if (apiKey) {
          const desdeGuardado = Number(await getStorageItemAsync('sesionDesde')) || 0;
          if (!desdeGuardado) {
            await setStorageItemAsync('sesionDesde', String(Date.now()));
          } else if (leerSalida() > desdeGuardado) {
            await deleteStorageItemAsync('apiKey');
            await deleteStorageItemAsync('sesionDesde');
            apiKey = null;
          }
        }

        if (cancelled) {
          return;
        }

        if (medusaUrl && apiKey) {
          const sdk = new Medusa({
            baseUrl: medusaUrl,
            debug: false,
            auth: {
              type: 'jwt',
              jwtTokenStorageMethod: 'custom',
              storage: {
                getItem: () => apiKey,
                setItem: () => { },
                removeItem: () => { },
              },
            },
          });

          if (cancelled) {
            return;
          }

          const userResponse = await sdk.admin.user.me();

          if (cancelled) {
            return;
          }

          const role = await resolverRol(sdk, userResponse.user as any);

          setState({
            status: 'authenticated',
            user: {
              id: userResponse.user.id,
              name:
                [userResponse.user.first_name, userResponse.user.last_name].filter(Boolean).join(' ') ||
                userResponse.user.email.split('@')[0],
              email: userResponse.user.email,
              role,
            },
            userEmail: userResponse.user.email,
            medusaUrl,
            apiKey,
          });
        } else {
          if (cancelled) {
            return;
          }

          await deleteStorageItemAsync('apiKey');

          setState({
            status: 'unauthenticated',
            medusaUrl: medusaUrl ?? undefined,
            userEmail: userEmail ?? undefined,
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        await deleteStorageItemAsync('apiKey');

        if (isUnauthorizedError(error)) {
          Toast.show({
            type: 'error',
            text1: 'La sesión caducó',
            text2: 'Vuelve a iniciar sesión para continuar.',
            visibilityTime: 4000,
          });
        } else {
          console.error('Failed to load auth state:', error);
          Toast.show({
            type: 'error',
            text1: 'No se pudo comprobar la sesión',
            text2: 'Inténtalo de nuevo.',
            visibilityTime: 4000,
          });
        }

        setState({ status: 'unauthenticated', medusaUrl: undefined });
      }
    };

    loadAuthState();

    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={{ state, login, logout }}>{children}</AuthContext.Provider>;
};

export const useAuthCtx = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthCtx must be used within an AuthProvider');
  }
  return context;
};

export const useAuthenticated = () => {
  const { state } = useAuthCtx();

  if (state.status !== 'authenticated') {
    throw new Error('User is not authenticated');
  }

  return state;
};

export const useMedusaSdk = () => {
  const { state } = useAuthCtx();

  if (state.status !== 'authenticated') {
    throw new Error('User is not authenticated');
  }

  return React.useMemo(
    () =>
      new Medusa({
        baseUrl: state.medusaUrl,
        debug: false,
        auth: {
          type: 'jwt',
          jwtTokenStorageMethod: 'custom',
          storage: {
            getItem: () => state.apiKey,
            setItem: () => { },
            removeItem: () => { },
          },
        },
      }),
    [state.medusaUrl, state.apiKey],
  );
};
