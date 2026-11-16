import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { FATOR_NIVEL, PESO_PADRAO } from './constantes';

/** Prioridade = peso × fator do nível. Sem pesos informados, todas têm peso igual. */
export function prioridade(d: DisciplinaPlano, pesosInformados: boolean): number {
  const bruto = pesosInformados ? (d.questoes ?? d.pontos ?? PESO_PADRAO) : PESO_PADRAO;
  const peso = Number.isFinite(bruto) && bruto > 0 ? bruto : PESO_PADRAO;
  return peso * FATOR_NIVEL[d.nivel];
}
