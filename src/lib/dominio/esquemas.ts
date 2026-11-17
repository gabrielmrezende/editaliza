import { z } from 'zod';
import { MSG_TEMPO_OU_QUESTOES } from '@/lib/acompanhamento/mensagens';
import { INTERVALOS_REVISAO, ORIGENS_SESSAO, TIPOS_SESSAO } from './acompanhamento';
import type { ConteudoCargo, MinutosPorDia } from './tipos';

const dataIso = z.iso.date('Data deve estar no formato aaaa-mm-dd');
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
}).refine((p) => p.disciplinas.some((d) => d.topicos.length > 0), {
  message: 'O plano precisa de ao menos 1 tópico.',
  path: ['disciplinas'],
});

const idCurto = z.string().min(1).max(64);
const contagem = z.number().int().min(0).max(10000);
const observacao = z
  .string()
  .trim()
  .max(1000)
  .transform((v) => (v === '' ? null : v))
  .nullable();

export const EsquemaNovaSessao = z
  .object({
    planoId: z.uuid(),
    data: dataIso,
    disciplinaId: idCurto,
    topicoId: idCurto.nullable(),
    minutos: z.number().int().min(0).max(1440),
    acertos: contagem.default(0),
    erros: contagem.default(0),
    tipo: z.enum(TIPOS_SESSAO).nullable(),
    observacao,
    origem: z.enum(ORIGENS_SESSAO),
    intervalos: z
      .array(z.number().refine((n) => (INTERVALOS_REVISAO as readonly number[]).includes(n), 'Intervalo inválido.'))
      .refine((v) => new Set(v).size === v.length, 'Intervalos repetidos.')
      .default([]),
    concluir: z.boolean().default(false),
  })
  .refine((s) => s.minutos > 0 || s.acertos + s.erros > 0, {
    message: 'Informe o tempo ou as questões.',
    path: ['minutos'],
  })
  .refine((s) => s.topicoId !== null || (s.intervalos.length === 0 && !s.concluir), {
    message: 'Revisões e conclusão exigem um tópico.',
    path: ['topicoId'],
  });
export type NovaSessao = z.infer<typeof EsquemaNovaSessao>;

export const EsquemaEdicaoSessao = z
  .object({
    data: dataIso,
    disciplinaId: idCurto,
    topicoId: idCurto.nullable(),
    minutos: z.number().int().min(0).max(1440),
    acertos: contagem,
    erros: contagem,
    tipo: z.enum(TIPOS_SESSAO).nullable(),
    observacao,
  })
  .partial()
  .refine((e) => Object.values(e).some((v) => v !== undefined), 'Informe ao menos um campo.');

/**
 * O que a tela leu da fila: a posição e o `ajustado_em` do plano (exatamente como o servidor mandou;
 * null se nunca ajustado). Protege contra clique duplo, outra aba e tela aberta antes de um ajuste.
 */
const filaLida = {
  posicaoEsperada: z.number().int().min(0),
  ajustadoLido: z.string().max(64).nullable(),
};

/**
 * Concluir (ou só salvar) o bloco atual da fila. Além da fila lida, a tela manda a matéria e o tópico
 * que mostrou: se o servidor calcular outro bloco (fila refeita, tópico marcado noutra aba), é 409.
 */
export const EsquemaConcluirBloco = z
  .object({
    ...filaLida,
    disciplinaId: idCurto,
    topicoId: idCurto.nullable(),
    minutos: z.number().int().min(0).max(1440),
    acertos: contagem.default(0),
    erros: contagem.default(0),
    concluirTopico: z.boolean().default(false),
    avancar: z.boolean().default(true),
    origem: z.enum(['cronometro', 'rapido']),
  })
  .refine((s) => s.minutos > 0 || s.acertos + s.erros > 0, {
    message: MSG_TEMPO_OU_QUESTOES,
    path: ['minutos'],
  });

/** Voltar um bloco da fila. */
export const EsquemaVoltarBloco = z.object(filaLida);

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
