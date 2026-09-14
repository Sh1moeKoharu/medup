import { clx } from '@/utils/clx';
import { Text as NativeText, TextProps } from 'react-native';

/**
 * El texto del sistema.
 *
 * Es el ÚNICO sitio donde se aplica la familia tipográfica. Ponerla aquí y no
 * en cada pantalla es lo que permite cambiarla después sin tocar nada más.
 *
 * El tamaño por defecto sigue siendo `text-base`, y cada tamaño de la escala
 * lleva su propio peso: los títulos en ligero, el cuerpo en normal. Antes TODO
 * salía en peso 500 y por eso la pantalla se veía plana, sin jerarquía entre lo
 * que se lee y lo que se ojea.
 *
 * Cualquier clase que se pase por fuera gana, porque `clx` resuelve el conflicto
 * a favor de la última.
 */
export const Text: React.FC<TextProps> = ({ className, ...props }) => {
  return <NativeText className={clx('font-sans text-base text-black', className)} {...props} />;
};
