import { NotaDeAtencion, useCorregirNota, useImprimirDocumento, useMiPerfil } from '@/api/hooks/clinica';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { color } from '@/theme/tokens';
import { clx } from '@/utils/clx';
import * as React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';

/**
 * Una nota de atención en el historial, con su corrección a mano.
 *
 * ── CORREGIR SIN BORRAR ─────────────────────────────────────────────────────
 * El tester pidió poder editar la nota de atención. Una nota es expediente:
 * se corrige —un dato mal capturado, un hallazgo que faltó— pero lo escrito
 * no desaparece. El servidor guarda la versión anterior (`revisions`) y aquí
 * se puede ver con «Versión anterior». La corrige quien la escribió;
 * Administración también.
 *
 * Si la nota tenía estructura (qué revisó / qué hizo), se corrige por partes;
 * si era texto libre, como texto libre. La fecha de la atención también.
 */

const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const soloDia = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};

const campo = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base';

export const TarjetaDeNota: React.FC<{ nota: NotaDeAtencion; conImprimir?: boolean }> = ({ nota, conImprimir = false }) => {
  const perfil = useMiPerfil();
  const corregir = useCorregirNota();
  const imprimir = useImprimirDocumento();
  const [editando, setEditando] = React.useState(false);
  const [verAnterior, setVerAnterior] = React.useState(false);

  const estructurada = nota.findings != null || nota.procedures != null;
  const [revision, setRevision] = React.useState(nota.findings ?? '');
  const [hecho, setHecho] = React.useState(nota.procedures ?? '');
  const [contenido, setContenido] = React.useState(nota.content);
  const [fecha, setFecha] = React.useState(soloDia(nota.attended_at));

  const puedeCorregir = !!perfil.data && (perfil.data.id === nota.author_id || perfil.data.rol === 'admin');
  const revisiones = nota.revisions ?? [];

  const empezar = () => {
    setRevision(nota.findings ?? '');
    setHecho(nota.procedures ?? '');
    setContenido(nota.content);
    setFecha(soloDia(nota.attended_at));
    setEditando(true);
  };

  const listo = estructurada ? revision.trim().length >= 5 && hecho.trim().length >= 5 : contenido.trim().length >= 5;

  const guardar = () => {
    corregir.mutate(
      {
        id: nota.id,
        ...(estructurada ? { findings: revision.trim(), procedures: hecho.trim() } : { content: contenido.trim() }),
        attended_at: fecha.trim() || null,
      },
      {
        onSuccess: () => {
          setEditando(false);
          Toast.show({ type: 'success', text1: 'Nota corregida', text2: 'La versión anterior queda guardada en el expediente.' });
        },
      },
    );
  };

  return (
    <View className="rounded-2xl border border-gray-200 bg-white p-4">
      <Text className="text-xs text-gray-400">
        {fechaLarga(nota.attended_at ?? nota.created_at)} · {nota.author_name ?? 'quien atendió'}
      </Text>
      {!!nota.edited_at && (
        <Text className="text-xs text-warning-500">
          Corregida el {fechaLarga(nota.edited_at)}
          {nota.edited_by_name ? ` por ${nota.edited_by_name}` : ''}
        </Text>
      )}

      {editando ? (
        <View className="mt-2 gap-2">
          <Text className="text-xs text-gray-500">Fecha de la atención</Text>
          <TextInput value={fecha} onChangeText={setFecha} placeholder="2026-09-24" placeholderTextColor={color.textoTerciario} accessibilityLabel="Fecha de la atención" className={campo} />
          {estructurada ? (
            <>
              <Text className="text-xs text-gray-500">Qué revisó</Text>
              <TextInput value={revision} onChangeText={setRevision} multiline accessibilityLabel="Qué revisó" placeholderTextColor={color.textoTerciario} className={clx(campo, 'min-h-[72px]')} />
              <Text className="text-xs text-gray-500">Qué hizo</Text>
              <TextInput value={hecho} onChangeText={setHecho} multiline accessibilityLabel="Qué hizo" placeholderTextColor={color.textoTerciario} className={clx(campo, 'min-h-[72px]')} />
            </>
          ) : (
            <>
              <Text className="text-xs text-gray-500">Nota</Text>
              <TextInput value={contenido} onChangeText={setContenido} multiline accessibilityLabel="Nota" placeholderTextColor={color.textoTerciario} className={clx(campo, 'min-h-[96px]')} />
            </>
          )}
          <View className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onPress={() => setEditando(false)} disabled={corregir.isPending}>
              Cancelar
            </Button>
            <Button className="flex-1" onPress={guardar} disabled={!listo} isPending={corregir.isPending}>
              Guardar corrección
            </Button>
          </View>
        </View>
      ) : (
        <Text className="mt-1 text-gray-800">{nota.content}</Text>
      )}

      {!editando && (puedeCorregir || conImprimir || revisiones.length > 0) && (
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {puedeCorregir && (
            <TouchableOpacity onPress={empezar} className="rounded-full bg-info-200 px-4 py-2" accessibilityLabel="Corregir la nota de atención">
              <Text className="text-sm font-semibold text-info-500">Corregir</Text>
            </TouchableOpacity>
          )}
          {conImprimir && (
            <TouchableOpacity onPress={() => imprimir.mutate({ tipo: 'nota', id: nota.id })} disabled={imprimir.isPending} className="rounded-full border border-gray-300 px-4 py-2">
              <Text className="text-sm font-semibold text-gray-700">Imprimir</Text>
            </TouchableOpacity>
          )}
          {revisiones.length > 0 && (
            <TouchableOpacity onPress={() => setVerAnterior((v) => !v)} className="px-2 py-2">
              <Text className="text-sm text-gray-500">
                {verAnterior ? 'Ocultar' : 'Versión anterior'}
                {revisiones.length > 1 ? ` (${revisiones.length})` : ''}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {verAnterior && !editando && revisiones.length > 0 && (
        <View className="mt-2 gap-2 border-t border-gray-100 pt-2">
          {revisiones.map((r, i) => (
            <View key={i} className="rounded-xl bg-gray-50 p-3">
              <Text className="text-xs text-gray-400">
                Escrita el {fechaLarga(r.written_at)}
                {r.written_by ? ` por ${r.written_by}` : ''}
              </Text>
              <Text className="text-sm text-gray-600">{r.content}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
