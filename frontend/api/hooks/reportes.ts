import { useAuthenticated, useMedusaSdk } from '@/contexts/auth';
import { descargarTexto } from '@/utils/descargar';
import { showErrorToast } from '@/utils/errors';
import { imprimirHtml } from '@/utils/imprimir';
import { useMutation, useQuery } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

/**
 * Reportes exportables (backend/src/lib/reportes.ts): el catálogo que le toca
 * a quien consulta, la vista previa, el CSV y la hoja impresa.
 */

export type FiltroDeReporte = 'rango' | 'rol' | 'persona' | 'almacen' | 'agrupar';

export interface DefinicionDeReporte {
  tipo: string;
  etiqueta: string;
  descripcion: string;
  filtros: FiltroDeReporte[];
  agrupaciones?: { valor: string; etiqueta: string }[];
}

export type TipoDeColumna = 'texto' | 'numero' | 'dinero' | 'fecha' | 'fechahora' | 'horas';

export interface TablaDeReporte {
  titulo: string;
  subtitulo?: string;
  columnas: { clave: string; etiqueta: string; tipo?: TipoDeColumna }[];
  filas: Record<string, unknown>[];
  totales?: Record<string, unknown>;
  notas?: string[];
}

export interface ConsultaDeReporte {
  tipo: string;
  desde?: string;
  hasta?: string;
  rol?: string;
  persona?: string;
  almacen?: string;
  agrupar?: string;
}

const aQuery = (c: ConsultaDeReporte) =>
  Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')) as Record<string, string>;

export const useTiposDeReporte = () => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['reportes', 'tipos'],
    queryFn: async () => (await sdk.client.fetch<{ reportes: DefinicionDeReporte[] }>('/admin/reports/tipos')).reportes,
  });
};

export const useVistaPreviaDeReporte = (consulta: ConsultaDeReporte | null) => {
  const sdk = useMedusaSdk();
  return useQuery({
    queryKey: ['reportes', 'vista', consulta],
    enabled: !!consulta?.tipo,
    queryFn: async () => {
      const r = await sdk.client.fetch<{ tabla: TablaDeReporte }>('/admin/reports/export', { query: { ...aQuery(consulta!), formato: 'json' } });
      return r.tabla;
    },
  });
};

/**
 * El CSV. La ruta devuelve texto, no JSON, así que no pasa por el cliente del
 * SDK: se pide con el token y se entrega al navegador como archivo.
 */
export const useDescargarReporte = () => {
  const { medusaUrl, apiKey } = useAuthenticated();
  return useMutation({
    mutationKey: ['reportes', 'csv'],
    mutationFn: async (consulta: ConsultaDeReporte) => {
      const q = new URLSearchParams({ ...aQuery(consulta), formato: 'csv' });
      const r = await fetch(`${medusaUrl.replace(/\/+$/, '')}/admin/reports/export?${q.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message || `El servidor respondió ${r.status}.`);
      }
      const nombre = /filename="?([^";]+)"?/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `${consulta.tipo}.csv`;
      if (!descargarTexto(nombre, await r.text(), 'text/csv;charset=utf-8')) {
        throw new Error('La descarga sólo está disponible en el navegador.');
      }
      return nombre;
    },
    onSuccess: (nombre) => Toast.show({ type: 'success', text1: 'Archivo descargado', text2: nombre }),
    onError: (error) => showErrorToast(error),
  });
};

export const useImprimirReporte = () => {
  const sdk = useMedusaSdk();
  return useMutation({
    mutationKey: ['reportes', 'imprimir'],
    mutationFn: async (consulta: ConsultaDeReporte) => {
      const r = await sdk.client.fetch<{ html: string; title: string }>('/admin/reports/export', { query: { ...aQuery(consulta), formato: 'html' } });
      if (!imprimirHtml(r.html)) {
        throw new Error('La impresión sólo está disponible en el navegador.');
      }
      return r.title;
    },
    onSuccess: (titulo) => Toast.show({ type: 'success', text1: 'Enviado a la impresora', text2: titulo }),
    onError: (error) => showErrorToast(error),
  });
};
