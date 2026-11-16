import { z } from 'zod';
import type { ConteudoCargo, MinutosPorDia } from './tipos';

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato aaaa-mm-dd');
const tipoProva = z.enum(['multipla_escolha', 'certo_errado', 'discursiva', 'mista']);
const questoes = z.number().int().min(0).nullable();
const pontos = z.number().min(0).nullable();

export const EsquemaEditalResumo = z.object({
  orgao: z.string().min(1),
  banca: z.string().nullable(),
  ano: z.number().int().nullable(),
  dataProva: dataIso.nullable(),
  cargos: z.array(z.object({ nome: z.string().min(1) })),
});

export const EsquemaConteudoCargoIA = z.object({
  disciplinas: z.array(
    z.object({
      nome: z.string(),
      questoes,
      pontos,
      topicos: z.array(z.string()),
    }),
  ),
  tipoProva,
  pesosInformados: z.boolean(),
});
export type ConteudoCargoIA = z.infer<typeof EsquemaConteudoCargoIA>;

export const EsquemaDisciplinaPlano = z.object({
  id: z.string(),
  nome: z.string().min(1),
  questoes,
  pontos,
  nivel: z.enum(['nunca_vi', 'basico', 'domino']),
  topicos: z.array(z.object({ id: z.string(), nome: z.string().min(1) })),
});

export const EsquemaEntradaCriarPlano = z.object({
  editalId: z.uuid(),
  cargoId: z.uuid(),
  dataProva: dataIso.nullable(),
  minutosPorDia: z.array(z.number().int().min(0).max(1440)).length(7).transform((v) => v as MinutosPorDia),
  disciplinas: z.array(EsquemaDisciplinaPlano).min(1),
});

export function atribuirIds(ia: ConteudoCargoIA): ConteudoCargo {
  return {
    tipoProva: ia.tipoProva,
    pesosInformados: ia.pesosInformados,
    disciplinas: ia.disciplinas.map((d, i) => ({
      id: `d${i}`,
      nome: d.nome,
      questoes: d.questoes,
      pontos: d.pontos,
      topicos: d.topicos.map((nome, j) => ({ id: `d${i}-t${j}`, nome })),
    })),
  };
}
