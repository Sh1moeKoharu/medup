import { DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL } from '@/api/hooks/draft-orders';
import { useMedusaSdk } from '@/contexts/auth';
import { showErrorToast } from '@/utils/errors';
import { AdminCreateCustomer, AdminCustomerFilters, AdminCustomerListResponse, AdminUpdateCustomer } from '@medusajs/types';
import {
  InfiniteData,
  UndefinedInitialDataInfiniteOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

const PER_PAGE = 20;

export const useCustomers = (
  query?: Omit<AdminCustomerFilters, 'limit' | 'offset'>,
  limit = PER_PAGE,
  options?: Omit<
    UndefinedInitialDataInfiniteOptions<
      AdminCustomerListResponse,
      unknown,
      InfiniteData<AdminCustomerListResponse>,
      readonly unknown[],
      number
    >,
    'queryKey' | 'queryFn' | 'initialPageParam' | 'getNextPageParam' | 'getPreviousPageParam'
  >,
) => {
  const sdk = useMedusaSdk();

  /**
   * El invitado del punto de venta NO es una persona.
   *
   * Es la ficha que el POS asigna a un pedido en borrador mientras la venta
   * todavia no tiene paciente asignado: Medusa exige un `customer` para abrir
   * el borrador. Aparecia en el directorio y en el buscador de pacientes como
   * si fuera alguien mas, con su correo del starter de Agilo a la vista.
   *
   * No se puede borrar —toda venta que empieza sin paciente lo usa—, asi que se
   * esconde de los listados. Se filtra AQUI, en el unico sitio por el que pasan
   * los cuatro listados de personas (buscador, directorio de Caja y directorio
   * de Medico y Enfermeria), en lugar de repetirlo en cada pantalla.
   *
   * Excepcion: si alguien lo pide EXPRESAMENTE por su correo, se devuelve. El
   * carrito lo necesita para poder quitar el paciente de una venta y dejarla
   * otra vez a nombre del invitado.
   */
  const loPidenPorCorreo = query?.email === DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL;

  return useInfiniteQuery({
    queryKey: ['customers', JSON.stringify(query ?? {})],
    queryFn: async ({ pageParam = 1 }) => {
      const pagina = await sdk.admin.customer.list({
        ...query,
        limit,
        offset: (pageParam - 1) * limit,
      });

      if (loPidenPorCorreo) {
        return pagina;
      }

      // `count` se deja como viene del servidor a proposito: es lo que usa el
      // paginado para saber si quedan mas paginas, y tocarlo por un unico
      // registro escondido lo desajustaria.
      return {
        ...pagina,
        customers: pagina.customers.filter((c) => c.email !== DRAFT_ORDER_DEFAULT_CUSTOMER_EMAIL),
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const nextPage = (lastPage.offset + lastPage.limit) / limit + 1;
      return lastPage.count > lastPage.offset + lastPage.limit ? nextPage : undefined;
    },
    getPreviousPageParam: (firstPage) => {
      const prevPage = (firstPage.offset + firstPage.limit) / limit - 1;
      return prevPage >= 1 ? prevPage : undefined;
    },
    ...options,
  });
};

export const useCreateCustomer = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['customers', 'create'],
    // Sin correo: los pacientes ya no lo llevan. El tipo del SDK lo marca como
    // obligatorio, pero el servidor lo admite vacío (validators de Medusa:
    // `email: nullish`), así que se relaja aquí y no en cada pantalla.
    mutationFn: async (data: Omit<AdminCreateCustomer, 'email'> & { email?: string }) => {
      return sdk.admin.customer.create(data as AdminCreateCustomer);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['customers'],
        exact: false,
      });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

/**
 * Modificación de un paciente ya registrado.
 *
 * Recepción es quien corrige un teléfono mal tecleado o un apellido; obligar a
 * pedírselo al administrador por una errata no tiene sentido operativo, y el
 * documento sitúa el alta de pacientes en el mostrador.
 */
export const useUpdateCustomer = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['customers', 'update'],
    mutationFn: async ({ id, update }: { id: string; update: AdminUpdateCustomer }) => {
      return sdk.admin.customer.update(id, update);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['medical-customers'], exact: false });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

/**
 * Baja de un paciente.
 *
 * El servidor sólo se lo permite al administrador (ver api-policy.ts): un
 * paciente puede tener órdenes médicas y compras colgando, y borrarlo deja el
 * historial clínico apuntando a alguien que ya no existe. La pantalla ofrece la
 * acción a todos, pero quien no tenga permiso recibirá un 403 con el motivo;
 * por eso la interfaz sólo muestra el botón a quien puede usarlo.
 */
export const useDeleteCustomer = () => {
  const sdk = useMedusaSdk();
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['customers', 'delete'],
    mutationFn: async (id: string) => {
      return sdk.admin.customer.delete(id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['medical-customers'], exact: false });
    },
    onError: (error) => {
      showErrorToast(error);
    },
  });
};

export const useMedicalCustomers = () => {
  const sdk = useMedusaSdk();

  return useQuery({
    queryKey: ['medical-customers'],
    queryFn: async () => {
      const { medical_customers } = await sdk.client.fetch<{ medical_customers: Record<string, any> }>(
        '/admin/medical-customers',
      );
      return medical_customers;
    },
  });
};
