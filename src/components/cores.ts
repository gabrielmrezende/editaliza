import type { CSSProperties } from 'react';

/** Cores das matérias (DISC_CORES do legado), escolhidas pelo índice da matéria no plano. */
export const CORES_MATERIA = [
  '#C8102E',
  '#0D134C',
  '#E255BE',
  '#A7C3BB',
  '#EFBD7B',
  '#AFE8D0',
  '#7c3aed',
  '#BAFF38',
  '#0d9488',
  '#ea580c',
] as const;

export const corDaMateria = (indice: number): string =>
  CORES_MATERIA[((indice % CORES_MATERIA.length) + CORES_MATERIA.length) % CORES_MATERIA.length];

/** Estilo que pinta `.bolinha` (e o que mais usar `--cor-materia`) com a cor da matéria. */
export const estiloMateria = (indice: number): CSSProperties =>
  ({ '--cor-materia': corDaMateria(indice) }) as CSSProperties;

/** Mapa id da matéria → índice no plano (para a cor). */
export const indicesDasMaterias = (disciplinas: { id: string }[]): Map<string, number> =>
  new Map(disciplinas.map((d, i) => [d.id, i]));
