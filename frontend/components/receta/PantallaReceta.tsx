import { useCrearOrdenMedica } from '@/api/hooks/medical-orders';
import { useExistenciasPorArea, useImprimirDocumento, type ExistenciaPorArea } from '@/api/hooks/clinica';
import { NotaDeAtencion } from '@/components/clinica/NotaDeAtencion';
import { ChevronDown } from '@/components/icons/chevron-down';
import { CheckCircle } from '@/components/icons/check-circle';
import { ClipboardList } from '@/components/icons/clipboard-list';
import { Trash2 } from '@/components/icons/trash-2';
import { UserRoundPlus } from '@/components/icons/user-round-plus';
import { X } from '@/components/icons/x';
import { InfoBanner } from '@/components/InfoBanner';
import { CartSkeleton } from '@/components/skeletons/CartSkeleton';
import { Button } from '@/components/ui/Button';
import { Layout } from '@/components/ui/Layout';
import { EncabezadoDeReceta } from '@/components/receta/EncabezadoDeReceta';
import { VistaPreviaDeReceta } from '@/components/receta/VistaPreviaDeReceta';
import { QuantityPicker } from '@/components/ui/QuantityPicker';
import { Text } from '@/components/ui/Text';
import { RenglonReceta, useReceta } from '@/contexts/receta';
import { KEYBOARD_DISMISS_MODE } from '@/utils/keyboard';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { color } from '@/theme/tokens';
import { ROLES } from '@/constants/roles';
import { useTieneRol } from '@/hooks/useRol';
import { clx } from '@/utils/clx';

/** Lo mínimo para que una indicación diga algo. Espejo de lib/receta.ts del servidor. */
const LARGO_MINIMO_INDICACIONES = 3;
const LARGO_MINIMO_NOTA = 5;
const hoyComoDia = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * La receta en construcción: paciente, medicamentos con posología y notas.
 *
 * Es la misma pantalla para Médico y Enfermería; cada grupo de rutas la
 * re-exporta. Antes eran dos copias idénticas de 311 líneas del carrito de
 * caja, apoyadas en los pedidos en borrador del POS (ver contexts/receta.tsx
 * para el porqué eso no funcionaba). Aquí NO hay precios: una receta no cobra.
 */

const nombreDe = (p: { first_name?: string | null; last_name?: string | null; email?: string | null }) =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Paciente';

// ── Paciente ────────────────────────────────────────────────────────────────

const PacienteBadge: React.FC = () => {
  const receta = useReceta();

  if (!receta.paciente) {
    return (
      <Button
        onPress={() => router.push({ pathname: '/customer-lookup', params: { destino: 'receta' } })}
        variant="outline"
        icon={<UserRoundPlus size={20} />}
        className="mb-6 justify-between"
      >
        Seleccionar paciente
      </Button>
    );
  }

  const p = receta.paciente;

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({ pathname: '/customer-lookup', params: { destino: 'receta', customerId: p.id } })
      }
      className="mb-6 flex-row items-center justify-between border-b border-gray-200 pb-6"
      accessibilityLabel="Cambiar paciente"
    >
      <View className="flex-1">
        <Text className="text-lg">{nombreDe(p)}</Text>
        <Text className="text-sm text-gray-300">
          Paciente{p.phone ? ` · ${p.phone}` : ''}
        </Text>
      </View>
      <View className="flex-row">
        <View className="p-2">
          <ChevronDown size={24} />
        </View>
        <TouchableOpacity onPress={receta.quitarPaciente} className="p-2" accessibilityLabel="Quitar paciente">
          <X size={24} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

// ── Renglón ─────────────────────────────────────────────────────────────────

const Renglon: React.FC<{ renglon: RenglonReceta; exigirIndicaciones: boolean; existencia?: ExistenciaPorArea }> = ({ renglon, exigirIndicaciones, existencia }) => {
  const receta = useReceta();
  const faltan = exigirIndicaciones && renglon.instructions.trim().length < LARGO_MINIMO_INDICACIONES;
  const disponible = existencia ? existencia.nursing + existencia.pharmacy : undefined;
  const excede = disponible !== undefined && renglon.quantity > disponible;

  return (
    <View className="gap-3 bg-white py-5">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-2">
          <Text className="text-base">{renglon.product_title}</Text>
          <QuantityPicker
            quantity={renglon.quantity}
            onQuantityChange={(q) => receta.cambiarCantidad(renglon.id, disponible !== undefined ? Math.min(q, Math.max(1, disponible)) : q)}
            className="self-start"
          />
          {existencia && (
            <Text className={clx('text-xs', excede ? 'text-error-500' : 'text-gray-500')}>
              {excede
                ? `Sólo hay ${disponible} entre Enfermería y Farmacia`
                : `Enfermería ${existencia.nursing} · Farmacia ${existencia.pharmacy}`}
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => receta.quitar(renglon.id)}
          accessibilityLabel={`Quitar ${renglon.product_title} de la receta`}
          className="rounded-xl border border-gray-200 p-2"
        >
          <Trash2 size={18} color={color.iconoError} />
        </Pressable>
      </View>
      <TextInput
        value={renglon.instructions}
        onChangeText={(t) => receta.cambiarIndicaciones(renglon.id, t)}
        placeholder={exigirIndicaciones ? 'Indicaciones (obligatorias): p. ej. 1 tableta cada 8 h por 5 días' : 'Indicaciones: p. ej. 1 tableta cada 8 h por 5 días'}
        placeholderTextColor={color.textoTerciario}
        multiline
        accessibilityLabel={`Indicaciones de ${renglon.product_title}`}
        className={clx('w-full rounded-xl border bg-gray-50 px-4 py-3 text-base', faltan ? 'border-error-300' : 'border-gray-200')}
      />
      {faltan && <Text className="text-xs text-error-500">Escribe cómo y cada cuánto se toma o se aplica.</Text>}
    </View>
  );
};

const Separador: React.FC = () => <View className="h-hairline bg-gray-200" />;

/**
 * La nota de atención de la consulta, dentro de la receta: qué revisó el
 * médico, qué hizo y cuándo. Va al expediente, no a Enfermería. Es opcional,
 * pero si se empieza hay que llenar las dos partes.
 */
const CamposNotaDeAtencion: React.FC = () => {
  const { nota, cambiarNota } = useReceta();
  const campo = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base';
  return (
    <View className="mt-4 gap-2 rounded-2xl border border-gray-200 bg-white p-4">
      <View>
        <Text className="text-lg">Nota de atención</Text>
        <Text className="text-sm text-gray-400">Para el expediente. Enfermería no la ve.</Text>
      </View>
      <Text className="text-xs text-gray-500">Fecha de la atención</Text>
      <TextInput
        value={nota.fecha}
        onChangeText={(fecha) => cambiarNota({ fecha })}
        placeholder={`${hoyComoDia()} (hoy)`}
        placeholderTextColor={color.textoTerciario}
        accessibilityLabel="Fecha de la atención"
        className={campo}
      />
      <Text className="text-xs text-gray-500">Qué revisó</Text>
      <TextInput
        value={nota.revision}
        onChangeText={(revision) => cambiarNota({ revision })}
        placeholder="Motivo de consulta, exploración, signos vitales, hallazgos…"
        placeholderTextColor={color.textoTerciario}
        multiline
        accessibilityLabel="Qué revisó"
        className={clx(campo, 'min-h-[72px]')}
      />
      <Text className="text-xs text-gray-500">Qué hizo</Text>
      <TextInput
        value={nota.hecho}
        onChangeText={(hecho) => cambiarNota({ hecho })}
        placeholder="Diagnóstico, procedimiento, tratamiento, recomendaciones…"
        placeholderTextColor={color.textoTerciario}
        multiline
        accessibilityLabel="Qué hizo"
        className={clx(campo, 'min-h-[72px]')}
      />
    </View>
  );
};

// ── Pantalla ────────────────────────────────────────────────────────────────

export function PantallaReceta({ isSidebar }: { isSidebar?: boolean }) {
  const receta = useReceta();
  const crear = useCrearOrdenMedica();
  const imprimir = useImprimirDocumento();
  const [confirmando, setConfirmando] = React.useState(false);
  const [emitida, setEmitida] = React.useState<{ id: string; pacienteId: string; paciente: string; renglones: number; destinatario: 'nursing' | 'pharmacy'; notaId: string | null } | null>(null);
  // El médico siempre envía a Enfermería y sus medicamentos llevan indicaciones
  // obligatorias (lo pidió la clínica). Enfermería, que también emite, conserva
  // la opción de mandar al mostrador.
  const esMedico = useTieneRol([ROLES.DOCTOR]);
  const destinatario = esMedico ? 'nursing' : receta.destinatario;
  const aEnfermeria = destinatario !== 'pharmacy';

  const existencias = useExistenciasPorArea(esMedico ? receta.renglones.map((r) => r.variant_id) : []);
  const renderItem = React.useCallback<ListRenderItem<RenglonReceta>>(
    ({ item }) => <Renglon renglon={item} exigirIndicaciones={esMedico} existencia={existencias.data?.[item.variant_id]} />,
    [esMedico, existencias.data],
  );
  const keyExtractor = React.useCallback((r: RenglonReceta) => r.id, []);

  const paddingSidebar = isSidebar ? 'px-4 md:px-4 lg:px-4 xl:px-4' : '';
  const faltaPaciente = !receta.paciente;
  const sinRenglones = receta.renglones.length === 0;
  const faltanIndicaciones = esMedico && receta.renglones.some((r) => r.instructions.trim().length < LARGO_MINIMO_INDICACIONES);
  const excedeExistencia =
    esMedico &&
    receta.renglones.some((r) => {
      const e = existencias.data?.[r.variant_id];
      return !!e && r.quantity > e.nursing + e.pharmacy;
    });
  const { revision, hecho, fecha } = receta.nota;
  const notaEmpezada = esMedico && (revision.trim() !== '' || hecho.trim() !== '');
  const notaIncompleta = notaEmpezada && (revision.trim().length < LARGO_MINIMO_NOTA || hecho.trim().length < LARGO_MINIMO_NOTA);
  const fechaInvalida = esMedico && fecha.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(fecha.trim());

  const emitir = () => {
    if (!receta.paciente) return;
    const paciente = receta.paciente;
    crear.mutate(
      {
        customer_id: paciente.id,
        customer_name: nombreDe(paciente),
        notes: receta.notas.trim() || undefined,
        recipient_area: destinatario,
        items: receta.renglones.map((r) => ({
          variant_id: r.variant_id,
          product_title: r.product_title,
          quantity: r.quantity,
          instructions: r.instructions.trim() || undefined,
        })),
        ...(notaEmpezada
          ? { nota_de_atencion: { findings: revision.trim(), procedures: hecho.trim(), attended_at: fecha.trim() || undefined } }
          : {}),
      },
      {
        onSuccess: (orden) => {
          setConfirmando(false);
          setEmitida({ id: orden.id, pacienteId: paciente.id, paciente: nombreDe(paciente), renglones: orden.items.length, destinatario, notaId: orden.nota_de_atencion_id });
          receta.vaciar();
          Toast.show({ type: 'success', text1: aEnfermeria ? 'Orden enviada a Enfermería' : 'Receta enviada a Farmacia', text2: nombreDe(paciente) });
        },
        onError: () => setConfirmando(false),
      },
    );
  };

  if (receta.cargando) {
    return <CartSkeleton />;
  }

  // ── Confirmación tras emitir ──────────────────────────────────────────────
  if (emitida) {
    return (
      <Layout className={`pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-6">
          <View className="items-center gap-3">
            <CheckCircle size={40} color={color.iconoExito} />
            <Text className="text-center text-xl">
              {emitida.destinatario === 'pharmacy' ? 'Receta enviada a Farmacia' : 'Orden enviada a Enfermería'}
            </Text>
            <Text className="text-center text-gray-400">
              {emitida.paciente} · {emitida.renglones} {emitida.renglones === 1 ? 'medicamento' : 'medicamentos'}
            </Text>
            <Text className="text-center text-sm text-gray-300">Folio {emitida.id}</Text>
          </View>
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => imprimir.mutate({ tipo: 'receta', id: emitida.id })} isPending={imprimir.isPending}>
              Imprimir receta
            </Button>
            <Button className="flex-1" onPress={() => setEmitida(null)}>
              Nueva receta
            </Button>
          </View>
          {emitida.notaId ? (
            <View className="gap-2 rounded-2xl border border-gray-200 bg-white p-4">
              <Text className="text-lg">Nota de atención guardada</Text>
              <Text className="text-sm text-gray-400">Quedó en el expediente de {emitida.paciente}, con la fecha de la atención.</Text>
              <Button variant="outline" className="self-start px-4" onPress={() => imprimir.mutate({ tipo: 'nota', id: emitida.notaId! })} isPending={imprimir.isPending}>
                Imprimir nota
              </Button>
            </View>
          ) : (
            // Sin nota en la receta, se puede escribir aquí mismo.
            <NotaDeAtencion customerId={emitida.pacienteId} medicalOrderId={emitida.id} contexto={emitida.paciente} />
          )}
        </ScrollView>
      </Layout>
    );
  }

  // ── Vacía ─────────────────────────────────────────────────────────────────
  if (sinRenglones) {
    return (
      <Layout className={`pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        {!isSidebar && <EncabezadoDeReceta compacto />}
        <PacienteBadge />
        <View className="flex-1 items-center justify-center gap-1">
          <ClipboardList size={24} />
          <Text className="text-xl">Sin medicamentos</Text>
          <Text className="text-center text-gray-400">
            Pulse + en un producto del catálogo para añadirlo a la receta
          </Text>
        </View>
      </Layout>
    );
  }

  return (
    <>
      <Layout className={`flex-1 pb-6 ${paddingSidebar}`}>
        <Text className="mt-8 mb-6 text-4xl">Receta</Text>
        {/* En pantalla ancha la receta va junto al catálogo, que ya lleva el
            encabezado completo; en la pestaña propia, la línea compacta. */}
        {!isSidebar && <EncabezadoDeReceta compacto />}
        <PacienteBadge />

        <FlashList
          data={receta.renglones}
          extraData={existencias.data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Separador}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode={KEYBOARD_DISMISS_MODE}
          ListFooterComponent={
            <View className="mt-4 gap-2">
              {/* A quién va. Decide la bandeja y el almacén; la cuenta del
                  paciente sólo se carga cuando la aplica Enfermería. El médico
                  no elige: lo suyo va siempre a Enfermería. */}
              {esMedico ? (
                <Text className="text-sm text-gray-400">Va a la Bandeja de Enfermería</Text>
              ) : (
              <>
              <Text className="text-sm text-gray-400">Va a</Text>
              <View className="flex-row gap-2">
                {([
                  ['nursing', 'Enfermería (consulta)'],
                  ['pharmacy', 'Farmacia (mostrador)'],
                ] as const).map(([valor, etiqueta]) => (
                  <Pressable
                    key={valor}
                    onPress={() => receta.cambiarDestinatario(valor)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: receta.destinatario === valor }}
                    className={`flex-1 items-center rounded-xl border px-3 py-3 ${receta.destinatario === valor ? 'border-active-500 bg-active-200' : 'border-gray-200 bg-white'}`}
                  >
                    <Text className={receta.destinatario === valor ? 'text-active-500' : 'text-gray-500'}>{etiqueta}</Text>
                  </Pressable>
                ))}
              </View>
              </>
              )}
              <Text className="mt-2 text-sm text-gray-400">{aEnfermeria ? 'Notas para Enfermería' : 'Notas para Farmacia'}</Text>
              <TextInput
                value={receta.notas}
                onChangeText={receta.cambiarNotas}
                placeholder={aEnfermeria ? 'Lo que Enfermería debe saber al aplicar: alergias, vía, cuidados…' : 'Alergias, observaciones…'}
                placeholderTextColor={color.textoTerciario}
                multiline
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base"
              />
              {esMedico && <CamposNotaDeAtencion />}
            </View>
          }
        />

        <View className="mt-4">
          <View className="mb-4 h-hairline bg-gray-200" />
          {faltaPaciente && (
            <InfoBanner variant="ghost" colorScheme="info" className="mb-3">
              Seleccione al paciente para poder emitir la receta.
            </InfoBanner>
          )}
          {!faltaPaciente && (excedeExistencia || faltanIndicaciones || notaIncompleta || fechaInvalida) && (
            <InfoBanner variant="ghost" colorScheme="warning" className="mb-3">
              {excedeExistencia
                ? 'Hay medicamentos recetados por encima de lo que existe. Ajusta la cantidad.'
                : faltanIndicaciones
                ? 'Cada medicamento necesita sus indicaciones.'
                : fechaInvalida
                  ? 'Escribe la fecha de la atención como 2026-09-14, o déjala vacía para hoy.'
                  : 'En la nota de atención, escribe qué revisaste y qué hiciste (o deja las dos vacías).'}
            </InfoBanner>
          )}
          <View className="flex-row gap-2 pb-6">
            <Button
              variant="outline"
              onPress={receta.vaciar}
              accessibilityLabel="Vaciar receta"
              className="px-4"
              icon={<Trash2 size={18} />}
            >
              Vaciar
            </Button>
            <Button
              className="flex-1"
              disabled={faltaPaciente || sinRenglones || excedeExistencia || faltanIndicaciones || notaIncompleta || fechaInvalida}
              isPending={crear.isPending}
              onPress={() => setConfirmando(true)}
            >
              Ver y emitir ({receta.totalUnidades})
            </Button>
          </View>
        </View>
      </Layout>

      {/* Antes de enviar se ve la receta tal como saldrá, con el encabezado
          y la cédula: corregir aquí no cuesta nada; ya emitida, sólo se
          cancela. */}
      <VistaPreviaDeReceta
        visible={confirmando}
        paciente={receta.paciente ? nombreDe(receta.paciente) : 'el paciente'}
        renglones={receta.renglones}
        notas={receta.notas}
        aEnfermeria={aEnfermeria}
        enviando={crear.isPending}
        onEnviar={emitir}
        onCorregir={() => setConfirmando(false)}
      />
    </>
  );
}
