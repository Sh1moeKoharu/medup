import { useProducts } from '@/api/hooks/products';
import { useAjustarOrden, useAplicarOrden, useBandeja, useExistenciasPorArea, useImprimirDocumento, type ExistenciaPorArea, type ResultadoDeAplicar } from '@/api/hooks/clinica';
import { useCrearRequisicion, useRequisiciones } from '@/api/hooks/requisiciones';
import { ExistenciaDelRenglon, HistorialDeAjustes, MotivoDeAjuste, ResumenDeExistencia, type EstadoDeExistencia } from '@/components/clinica/Ajustes';
import { useAvisoDeBandeja } from '@/hooks/useAvisoDeBandeja';
import { Trash2 } from '@/components/icons/trash-2';
import Toast from 'react-native-toast-message';
import type { OrdenMedica } from '@/api/hooks/medical-orders';
import { NotaDeAtencion } from '@/components/clinica/NotaDeAtencion';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Minus } from '@/components/icons/minus';
import { Plus } from '@/components/icons/plus';
import { Button } from '@/components/ui/Button';
import { LayoutWithScroll } from '@/components/ui/Layout';
import { Prompt } from '@/components/ui/Prompt';
import { Text } from '@/components/ui/Text';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatearDinero } from '@/utils/dinero';
import { clx } from '@/utils/clx';
import { color } from '@/theme/tokens';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';

/**
 * La bandeja de Enfermería: las órdenes que el médico dirigió a consulta.
 *
 * Por cada orden pendiente Enfermería puede ajustar lo que de verdad se usó
 * (una gasa más, una ampolleta menos) y APLICARLA: sale de su almacén y se
 * carga a la cuenta del paciente, que Caja cobra. Después, la nota de
 * atención y la impresión de la receta.
 *
 * ── LO QUE SE VE SIN ABRIR NADA ─────────────────────────────────────────────
 * La bandeja se actualiza sola, avisa cuando llega una orden (en pantalla y,
 * si se aceptó, con sonido), marca la recién llegada como «Nueva» hasta que se
 * abre, y en cada tarjeta cerrada dice si hay existencia para aplicarla. La
 * existencia de TODAS las órdenes se consulta de una vez desde la pantalla, no
 * orden por orden al abrirlas: seis órdenes eran seis consultas y seis huecos
 * mudos mientras cargaban.
 */

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const Boton: React.FC<{ onPress: () => void; label: string; children: React.ReactNode }> = ({ onPress, label, children }) => (
  <Pressable onPress={onPress} accessibilityLabel={label} className="min-h-toque min-w-toque items-center justify-center rounded-full border border-gray-200">
    {children}
  </Pressable>
);

/**
 * Una orden de la bandeja. Cuando se aplica, la lista de pendientes deja de
 * traerla, así que el resultado (lotes, cuenta, nota) vive en la pantalla y no
 * aquí: si viviera aquí, desaparecería con la tarjeta justo cuando hay que
 * escribir la nota.
 */
const Orden: React.FC<{
  orden: OrdenMedica;
  resultado?: ResultadoDeAplicar;
  existencias?: Record<string, ExistenciaPorArea>;
  estadoExistencia?: EstadoDeExistencia;
  nueva?: boolean;
  onAbrir?: () => void;
  onAplicada: (r: ResultadoDeAplicar) => void;
  onCerrar: () => void;
}> = ({ orden, resultado, existencias, estadoExistencia = 'listo', nueva = false, onAbrir, onAplicada, onCerrar }) => {
  const [abierta, setAbierta] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const termino = useDebouncedValue(busqueda, 300);
  const productos = useProducts(termino.trim().length >= 2 ? { q: termino.trim() } : undefined, 6, { enabled: termino.trim().length >= 2 });
  const ajustar = useAjustarOrden();
  const aplicar = useAplicarOrden();
  const imprimir = useImprimirDocumento();
  const [confirmando, setConfirmando] = React.useState(false);
  // Quitar o reducir lo recetado pide motivo: se escribe aquí, bajo el renglón.
  const [porReducir, setPorReducir] = React.useState<{ variant_id: string; cantidad: number; antes: number; titulo: string | null } | null>(null);
  const requisiciones = useRequisiciones({ medical_order_id: orden.id }, { enabled: abierta });
  const pedir = useCrearRequisicion();

  const unidades = orden.items.reduce((s, i) => s + i.quantity, 0);

  const cambiar = (variantId: string, cantidad: number, titulo?: string | null) => {
    const actual = orden.items.find((i) => i.variant_id === variantId)?.quantity ?? 0;
    const nueva = Math.max(0, cantidad);
    if (nueva < actual) {
      setPorReducir({ variant_id: variantId, cantidad: nueva, antes: actual, titulo: titulo ?? null });
      return;
    }
    ajustar.mutate({ id: orden.id, items: [{ variant_id: variantId, quantity: nueva, product_title: titulo ?? undefined }] });
  };

  const confirmarReduccion = (motivo: string) => {
    if (!porReducir) return;
    ajustar.mutate(
      { id: orden.id, motivo, items: [{ variant_id: porReducir.variant_id, quantity: porReducir.cantidad, product_title: porReducir.titulo ?? undefined }] },
      { onSuccess: () => setPorReducir(null) },
    );
  };

  // Lo que falta en Enfermería para aplicar la orden completa (punto 21), y si
  // ya se pidió a Farmacia desde aquí (punto 22).
  const faltantes = orden.items
    .map((i) => ({ i, e: existencias?.[i.variant_id] }))
    .filter(({ i, e }) => e && e.nursing < i.quantity)
    .map(({ i, e }) => ({ variant_id: i.variant_id, product_title: i.product_title ?? undefined, quantity: i.quantity - e!.nursing, enFarmacia: e!.pharmacy }));
  const enCamino = (requisiciones.data ?? []).find((r) => r.status === 'pending' || r.status === 'dispatched');

  const pedirFaltantes = () =>
    pedir.mutate(
      {
        medical_order_id: orden.id,
        notes: `Para aplicar la orden de ${orden.customer_name ?? 'un paciente'}`,
        items: faltantes.map(({ variant_id, product_title, quantity }) => ({ variant_id, product_title, quantity })),
      },
      { onSuccess: () => Toast.show({ type: 'success', text1: 'Pedido a Farmacia', text2: 'Aplica la orden cuando llegue y la recibas en Almacén.' }) },
    );

  const resultados = productos.data?.pages?.[0]?.products ?? [];

  if (resultado) {
    return (
      <View className="gap-3 rounded-2xl border border-success-300 bg-white p-4">
        <Text className="text-lg">Orden aplicada · {orden.customer_name ?? orden.customer_id}</Text>
        {resultado.lotes.map((l, i) => (
          <Text key={i} className="text-sm text-gray-500">
            {l.cantidad} × {l.product_title} — lote {l.batch_number} (quedan {l.saldo_restante})
          </Text>
        ))}
        {resultado.cuenta ? (
          <Text className="text-sm text-success-500">
            Cargado a la cuenta del paciente: {resultado.cuenta.items.length} renglones, {formatearDinero(resultado.cuenta.total, resultado.cuenta.currency_code)}. Caja lo cobra desde Pacientes.
          </Text>
        ) : (
          <Text className="text-sm text-error-500">{resultado.advertencia ?? 'No se pudo cargar a la cuenta del paciente.'}</Text>
        )}
        <Button variant="outline" className="self-start px-4 py-3" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
          Imprimir receta
        </Button>
        <NotaDeAtencion customerId={orden.customer_id} medicalOrderId={orden.id} contexto={orden.customer_name ?? undefined} />
        <Button variant="outline" className="self-start px-4 py-3" onPress={onCerrar}>
          Listo
        </Button>
      </View>
    );
  }

  return (
    <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <Pressable
        onPress={() => {
          setAbierta((a) => !a);
          if (!abierta) onAbrir?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Orden de ${orden.customer_name ?? 'paciente'}`}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-lg">{orden.customer_name || orden.customer_id}</Text>
            <Text className="text-sm text-gray-400">
              {fechaCorta(orden.created_at)} · {orden.creator_name ?? 'médico'} · {orden.items.length} {orden.items.length === 1 ? 'renglón' : 'renglones'} · {unidades} u.
            </Text>
            <View className="mt-1">
              <ResumenDeExistencia items={orden.items} existencias={existencias} estado={estadoExistencia} />
            </View>
          </View>
          {nueva ? (
            <View className="rounded-full bg-error-200 px-3 py-1">
              <Text className="text-xs text-error-500">Nueva</Text>
            </View>
          ) : (
            <View className="rounded-full bg-warning-200 px-3 py-1">
              <Text className="text-xs text-warning-500">Pendiente</Text>
            </View>
          )}
        </View>
      </Pressable>

      {abierta && (
        <View className="mt-2 gap-3 border-t border-gray-100 pt-3">
          {orden.items.map((i) => (
            <View key={i.id} className="gap-2">
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text>{i.product_title ?? i.variant_id}</Text>
                  {!!i.instructions && <Text className="text-sm text-gray-400">{i.instructions}</Text>}
                  <ExistenciaDelRenglon existencia={existencias?.[i.variant_id]} necesita={i.quantity} estado={estadoExistencia} />
                </View>
                <Boton onPress={() => cambiar(i.variant_id, i.quantity - 1, i.product_title)} label="Una menos"><Minus size={16} /></Boton>
                <Text className="w-8 text-center text-lg">{i.quantity}</Text>
                <Boton onPress={() => cambiar(i.variant_id, i.quantity + 1, i.product_title)} label="Una más"><Plus size={16} /></Boton>
                <Boton onPress={() => cambiar(i.variant_id, 0, i.product_title)} label={`Quitar ${i.product_title ?? 'renglón'}`}><Trash2 size={16} color={color.iconoError} /></Boton>
              </View>
              {porReducir?.variant_id === i.variant_id && (
                <MotivoDeAjuste
                  descripcion={porReducir.cantidad === 0 ? `Quitar ${i.product_title ?? 'este renglón'} de la receta.` : `Bajar ${i.product_title ?? 'este renglón'} de ${porReducir.antes} a ${porReducir.cantidad}.`}
                  enviando={ajustar.isPending}
                  onConfirmar={confirmarReduccion}
                  onCancelar={() => setPorReducir(null)}
                />
              )}
            </View>
          ))}
          {!!orden.notes && <Text className="text-sm text-gray-400">Notas para Enfermería: {orden.notes}</Text>}
          <HistorialDeAjustes ajustes={orden.ajustes} />

          {faltantes.length > 0 && (
            <View className="gap-2 rounded-xl border border-error-300 bg-error-200 p-3">
              <Text className="text-sm text-error-500">
                {faltantes.map((f) => `${f.product_title ?? 'Un renglón'}: faltan ${f.quantity}${f.enFarmacia < f.quantity ? ` (Farmacia tiene ${f.enFarmacia})` : ''}`).join(' · ')}
              </Text>
              {enCamino ? (
                <Text className="text-sm">
                  {enCamino.status === 'dispatched' ? 'Farmacia ya lo surtió: recíbelo en Almacén y aplica la orden.' : 'Requisición en camino: Farmacia aún no la surte.'}
                </Text>
              ) : (
                <Button variant="outline" className="self-start px-4" onPress={pedirFaltantes} isPending={pedir.isPending}>
                  Pedir faltantes a Farmacia
                </Button>
              )}
            </View>
          )}

          <TextInput
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Añadir material o medicamento"
            placeholderTextColor={color.textoTerciario}
            autoCorrect={false}
            className="min-h-toque rounded-xl border border-gray-300 bg-white px-4 py-3 text-base"
          />
          {termino.trim().length >= 2 && (
            <View className="rounded-2xl border border-gray-200">
              {resultados.length === 0 ? (
                <Text className="p-3 text-gray-400">{productos.isLoading ? 'Buscando…' : 'Sin resultados'}</Text>
              ) : (
                resultados.map((p) => {
                  const v = p.variants?.[0];
                  if (!v) return null;
                  const existente = orden.items.find((i) => i.variant_id === v.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        cambiar(v.id, (existente?.quantity ?? 0) + 1, p.title);
                        setBusqueda('');
                      }}
                      className="flex-row items-center justify-between border-b border-gray-100 px-4 py-3"
                      accessibilityRole="button"
                      accessibilityLabel={`Añadir ${p.title} a la orden`}
                    >
                      <Text className="flex-1" numberOfLines={2}>{p.title}</Text>
                      <Plus size={18} className="text-gray-500" />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          <View className="flex-row gap-2">
            <Button variant="outline" className="px-4" onPress={() => imprimir.mutate({ tipo: 'receta', id: orden.id })} isPending={imprimir.isPending}>
              Imprimir
            </Button>
            <Button className={clx('flex-1')} disabled={orden.items.length === 0} isPending={aplicar.isPending} onPress={() => setConfirmando(true)}>
              Aplicar ({unidades})
            </Button>
          </View>
        </View>
      )}

      <Prompt
        visible={confirmando}
        onClose={() => setConfirmando(false)}
        title="¿Aplicar esta orden?"
        description={`Saldrá del almacén de Enfermería y se cargará a la cuenta de ${orden.customer_name ?? 'el paciente'} para que Caja lo cobre. Si a algo no le alcanza la existencia, no se aplica nada.`}
        submitText="Aplicar"
        cancelText="Revisar"
        showCloseButton
        dismissOnOverlayPress
        onSubmit={() => {
          aplicar.mutate(orden.id, {
            onSuccess: (r) => onAplicada(r),
            onSettled: () => setConfirmando(false),
          });
        }}
      />
    </View>
  );
};

export default function BandejaScreen() {
  const bandeja = useBandeja('nursing');
  // Las recién aplicadas se quedan a la vista hasta que Enfermería pulse
  // «Listo»: es el momento de la nota de atención y de imprimir la receta.
  const [aplicadas, setAplicadas] = React.useState<Record<string, { orden: OrdenMedica; resultado: ResultadoDeAplicar }>>({});
  const lista = (bandeja.data ?? []).filter((o) => !aplicadas[o.id]);
  const recientes = Object.values(aplicadas);

  // Una sola consulta de existencia para toda la bandeja.
  const variantes = React.useMemo(() => lista.flatMap((o) => o.items.map((i) => i.variant_id)), [lista]);
  const existencias = useExistenciasPorArea(variantes);
  const estadoExistencia: EstadoDeExistencia =
    variantes.length === 0 ? 'listo' : existencias.isError ? 'error' : existencias.data ? 'listo' : 'cargando';

  const aviso = useAvisoDeBandeja(bandeja.data, bandeja.isSuccess);

  return (
    <LayoutWithScroll contentContainerClassName="pb-10">
      <Text className="mb-1 mt-8 text-4xl">Bandeja</Text>
      <Text className="mb-2 text-gray-400">Órdenes que el médico dirigió a consulta. Se actualiza sola. Revisa dónde hay existencia, pide a Farmacia lo que falte y aplícala: sale de tu almacén y queda en la cuenta del paciente. Quitar o reducir lo recetado pide motivo.</Text>

      {aviso.preferencia === 'si' || aviso.preferencia === 'no' ? (
        <Pressable
          onPress={() => aviso.decidir(aviso.preferencia !== 'si')}
          accessibilityRole="button"
          accessibilityLabel={aviso.preferencia === 'si' ? 'Desactivar el sonido de alerta' : 'Activar el sonido de alerta'}
          className="mb-6 self-start"
        >
          <Text className="text-sm text-gray-400">
            {aviso.preferencia === 'si' ? 'Alerta con sonido activada' : 'Alerta sin sonido'} ·{' '}
            <Text className="text-sm text-info-500">{aviso.preferencia === 'si' ? 'Desactivar' : 'Activar'}</Text>
          </Text>
        </Pressable>
      ) : (
        <View className="mb-6" />
      )}

      <Prompt
        visible={aviso.preferencia === null}
        onClose={() => aviso.decidir(false)}
        title="¿Avisar con sonido?"
        description="Cuando llegue una orden nueva sonará una alerta corta, además de aparecer arriba marcada como «Nueva». Se pregunta una sola vez; se cambia desde aquí mismo."
        submitText="Sí, activar"
        cancelText="Sin sonido"
        onSubmit={() => aviso.decidir(true)}
      />

      {recientes.length > 0 && (
        <View className="mb-3 gap-3">
          {recientes.map(({ orden, resultado }) => (
            <Orden
              key={orden.id}
              orden={orden}
              resultado={resultado}
              onAplicada={() => undefined}
              onCerrar={() => setAplicadas((a) => { const { [orden.id]: _fuera, ...resto } = a; return resto; })}
            />
          ))}
        </View>
      )}

      {bandeja.isError ? (
        <Button variant="outline" onPress={() => bandeja.refetch()} isPending={bandeja.isRefetching}>
          No se pudo cargar la bandeja. Reintentar
        </Button>
      ) : lista.length === 0 && recientes.length === 0 ? (
        <View className="items-center gap-1 py-10">
          <ClipboardList size={24} />
          <Text className="text-xl">Sin órdenes pendientes</Text>
          <Text className="text-center text-gray-400">Las órdenes que el médico dirija a Enfermería aparecerán aquí</Text>
        </View>
      ) : (
        <View className="gap-3">
          {lista.map((o) => (
            <Orden
              key={o.id}
              orden={o}
              existencias={existencias.data}
              estadoExistencia={estadoExistencia}
              nueva={aviso.nuevas.has(o.id)}
              onAbrir={() => aviso.marcarVista(o.id)}
              onAplicada={(r) => setAplicadas((a) => ({ ...a, [o.id]: { orden: o, resultado: r } }))}
              onCerrar={() => undefined}
            />
          ))}
        </View>
      )}
    </LayoutWithScroll>
  );
}
