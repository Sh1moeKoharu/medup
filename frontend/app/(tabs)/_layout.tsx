import { GuardaDeRol } from '@/components/GuardaDeRol';
import { ROLES_BITACORA, ROLES_CAJA } from '@/constants/acceso';
import { normalizeRole } from '@/constants/roles';
import { useAuthCtx } from '@/contexts/auth';
import { Tabs } from 'expo-router';
import { color } from '@/theme/tokens';
import { useWindowDimensions } from 'react-native';

import { useCurrentDraftOrder } from '@/api/hooks/draft-orders';
import { HapticTab } from '@/components/HapticTab';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Clock } from '@/components/icons/clock';
import { ScanBarcode } from '@/components/icons/scan-barcode';
import { Settings } from '@/components/icons/settings';
import { Wallet } from '@/components/icons/wallet';

import { ShoppingCart } from '@/components/icons/shopping-cart';
import { Store } from '@/components/icons/store';
import { UserRound } from '@/components/icons/user-round';

export const unstable_settings = {
  initialRouteName: 'products',
  detachInactiveScreens: false,
};

export default function TabLayout() {
  const draftOrder = useCurrentDraftOrder();

  // La bitacora es de Administracion: a Caja y Farmacia se les oculta la
  // pestana en vez de llevarles a una pantalla que responderia "prohibido".
  const { state } = useAuthCtx();
  const rolActual = state.status === 'authenticated' ? normalizeRole(state.user.role) : null;
  const puedeVerBitacora = !!rolActual && ROLES_BITACORA.includes(rolActual);

  /**
   * ── LAS ETIQUETAS NO CABÍAN EN UN TELÉFONO ────────────────────────────────
   * A 375 px había OCHO pestañas de 47 px, y el relleno lateral de 5 px del
   * botón dejaba la etiqueta en una caja de 37 px: "Productos" (46 px),
   * "Directorio" (45), "Actividad" (43) y "Escanear" (39) salían cortadas y
   * dejaban de ser reconocibles.
   *
   * Se corrige por los dos lados:
   *  · Una pestaña menos. El escáner es una cámara a pantalla completa que ya
   *    ocultaba la barra al abrirse: nunca fue una pestaña de igual rango que
   *    las demás. Ahora se abre con el botón de código de barras que está
   *    junto al buscador de Productos, donde empieza el trabajo en mostrador.
   *  · La etiqueta usa el ancho completo de su pestaña, sin el relleno que la
   *    recortaba, y encoge un punto en pantallas muy estrechas.
   *
   * Con siete pestañas la etiqueta más larga cabe con 8.6 px de holgura; con
   * ocho sólo sobraban 1.9 px, que se agotan al cambiar de tipografía.
   */
  const { width } = useWindowDimensions();
  const esTelefono = width < 768;
  // Desde tableta el carrito ya se ve como columna lateral del catálogo, así
  // que la pestaña sólo hace falta por debajo de ese ancho.
  const carritoEnLateral = width >= 1024;

  return (
    <GuardaDeRol permitidos={ROLES_CAJA}>
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        tabBarActiveTintColor: color.pestanaActiva,
        tabBarInactiveTintColor: color.pestanaInactiva,
        headerShown: false,
        tabBarButton: HapticTab,
        animation: 'shift',
        // Ver el comentario de arriba: sin esto la etiqueta se recorta a 37 px.
        tabBarItemStyle: esTelefono ? { paddingHorizontal: 0 } : undefined,
        tabBarLabelStyle: esTelefono ? { fontSize: width < 360 ? 9 : 10 } : undefined,
      }}
    >
      <Tabs.Screen
        name="products"
        options={{
          title: 'Productos',
          tabBarIcon: ({ color }) => <Store size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="orders"
        options={{
          title: 'Órdenes',
          tabBarIcon: ({ color }) => <ClipboardList size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="scan"
        options={{
          title: 'Escanear',
          tabBarIcon: ({ color }) => <ScanBarcode size={20} color={color} />,
          tabBarStyle: { display: 'none' },
          // Fuera de la barra, pero SIGUE siendo una ruta navegable: se abre con
          // el boton de codigo de barras del buscador de Productos.
          //
          // Se oculta el boton de la pestana, NO la ruta. Con `href: null` expo-router
          // la saca del navegador y deja de resolverse: se comprobo que
          // `router.push("/scan")` no hacia nada y que entrar por la direccion
          // /scan mostraba el catalogo.
          tabBarItemStyle: { display: "none" },
        }}
      />



      <Tabs.Screen
        name="crm"
        options={{
          // "Pacientes", igual que en Medico y Enfermeria: es la MISMA pantalla
          // y su encabezado ya dice "Pacientes / Directorio" en los tres
          // perfiles. Ademas cabe mejor: mide menos que "Directorio".
          title: 'Pacientes',
          tabBarIcon: ({ color }) => <UserRound size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="activity"
        options={{
          title: 'Actividad',
          // Se oculta el BOTON, no la ruta (ver el escaner, mas arriba).
          tabBarItemStyle: puedeVerBitacora ? undefined : { display: "none" },
          tabBarIcon: ({ color }) => <Clock size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cash-register"
        options={{
          title: 'Caja',
          tabBarIcon: ({ color }) => <Wallet size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: 'Carrito',
          href: carritoEnLateral ? null : undefined,
          tabBarIcon: ({ color }) => <ShoppingCart size={20} color={color} />,
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <Settings size={20} color={color} />,
        }}
      />
    </Tabs>
    </GuardaDeRol>
  );
}
