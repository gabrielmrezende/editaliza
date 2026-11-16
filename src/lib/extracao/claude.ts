import 'server-only';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo, type ConteudoCargoIA } from '@/lib/dominio/esquemas';
import type { EditalResumo } from '@/lib/dominio/tipos';
import { PROMPT_LISTAR_CARGOS, promptExtrairConteudo } from './prompts';
import { EditalInvalidoError, ExtracaoFalhouError, type Extrator } from './tipos';

const MODELO = 'claude-opus-5-5';
const DOLAR_EM_CENTAVOS = 550;
const USD_ENTRADA_POR_MILHAO = 4;
const USD_SAIDA_POR_MILHAO = 20;

export function calcularCustoCentavos(entrada: number, saida: number): number {
  const usd = (entrada * USD_ENTRADA_POR_MILHAO + saida * USD_SAIDA_POR_MILHAO) / 1_000_000;
  return Math.ceil(usd * DOLAR_EM_CENTAVOS);
}

// Esquemas enviados à API não carregam refinamentos (ex.: z.iso.date); a validação
// completa é feita depois com os esquemas do domínio.
const ResumoApi = z.object({
  orgao: z.string(),
  banca: z.string().nullable(),
  ano: z.number().nullable(),
  dataProva: z.string().nullable(),
  cargos: z.array(z.object({ nome: z.string() })),
});
const ConteudoApi = z.object({
  disciplinas: z.array(
    z.object({
      nome: z.string(),
      questoes: z.number().nullable(),
      pontos: z.number().nullable(),
      topicos: z.array(z.string()),
    }),
  ),
  tipoProva: z.enum(['multipla_escolha', 'certo_errado', 'discursiva', 'mista']),
  pesosInformados: z.boolean(),
});

export const ORGAO_PADRAO = 'Órgão não identificado';

const dataValida = z.iso.date();
const textoOuNull = (s: string | null) => (s && s.trim() ? s.trim() : null);
const inteiroNaoNegativo = (n: number | null) => (n !== null && Number.isInteger(n) && n >= 0 ? n : null);
const naoNegativo = (n: number | null) => (n !== null && Number.isFinite(n) && n >= 0 ? n : null);

/**
 * Campos opcionais inválidos (data impossível, ano não inteiro, órgão vazio, cargo sem nome) viram
 * null ou um padrão, em vez de derrubar a leitura inteira.
 */
export function normalizarResumo(api: z.infer<typeof ResumoApi>): EditalResumo {
  return {
    orgao: textoOuNull(api.orgao) ?? ORGAO_PADRAO,
    banca: textoOuNull(api.banca),
    ano: inteiroNaoNegativo(api.ano),
    dataProva: api.dataProva !== null && dataValida.safeParse(api.dataProva).success ? api.dataProva : null,
    cargos: api.cargos.flatMap((c) => (c.nome.trim() ? [{ nome: c.nome.trim() }] : [])),
  };
}

/** Questões não inteiras/negativas e pontos negativos viram null (peso padrão). */
export function normalizarConteudo(api: z.infer<typeof ConteudoApi>): ConteudoCargoIA {
  return {
    tipoProva: api.tipoProva,
    pesosInformados: api.pesosInformados,
    disciplinas: api.disciplinas.map((d) => ({
      nome: d.nome,
      questoes: inteiroNaoNegativo(d.questoes),
      pontos: naoNegativo(d.pontos),
      topicos: d.topicos,
    })),
  };
}

/** Converte o texto da resposta em valor validado; qualquer falha vira ExtracaoFalhouError. */
export function interpretarResposta<D extends z.ZodType>(
  stopReason: string | null | undefined,
  texto: string,
  esquema: D,
): z.infer<D> {
  if (stopReason !== 'end_turn') {
    throw new ExtracaoFalhouError(
      stopReason === 'refusal'
        ? 'A IA não pôde ler este documento.'
        : 'A leitura do edital foi interrompida. Tente novamente.',
      { cause: stopReason },
    );
  }
  if (texto.trim() === '') throw new ExtracaoFalhouError('A IA não devolveu nenhum conteúdo. Tente novamente.');
  try {
    return esquema.parse(JSON.parse(texto));
  } catch (cause) {
    throw new ExtracaoFalhouError('A resposta da IA veio em formato inesperado. Tente novamente.', { cause });
  }
}

/** Corpo da requisição: o PDF vai com cache (as duas leituras do mesmo edital reaproveitam o prefixo). */
export function montarRequisicao<A extends z.ZodType>(fileId: string, prompt: string, esquemaApi: A) {
  return {
    model: MODELO,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default' as const,
    output_config: { effort: 'medium' as const, format: zodOutputFormat(esquemaApi) },
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'document' as const,
            source: { type: 'file' as const, file_id: fileId },
            cache_control: { type: 'ephemeral' as const },
          },
          { type: 'text' as const, text: prompt },
        ],
      },
    ],
  };
}

type MensagemFinal = {
  stop_reason: string | null | undefined;
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
};

/** Custo calculado ANTES de interpretar: uma resposta inválida também é cobrada e vai no erro. */
export function lerMensagem<D extends z.ZodType>(msg: MensagemFinal, esquema: D): { dados: z.infer<D>; custoCentavos: number } {
  const u = msg.usage;
  // Escrita em cache custa 1,25× a entrada; leitura, 0,1× (arredondado para cima no total).
  const entrada = u.input_tokens + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0);
  const custoCentavos = calcularCustoCentavos(entrada, u.output_tokens);
  const texto = msg.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
  try {
    return { dados: interpretarResposta(msg.stop_reason, texto, esquema), custoCentavos };
  } catch (erro) {
    if (erro instanceof ExtracaoFalhouError) erro.custoCentavos = custoCentavos;
    throw erro;
  }
}

async function chamar<A extends z.ZodType, D extends z.ZodType>(
  client: Anthropic,
  fileId: string,
  prompt: string,
  esquemaApi: A,
  normalizar: (bruto: z.infer<A>) => z.input<D>,
  esquemaDominio: D,
): Promise<{ dados: z.infer<D>; custoCentavos: number }> {
  const msg = await client.beta.messages.stream(montarRequisicao(fileId, prompt, esquemaApi)).finalMessage();
  const { dados, custoCentavos } = lerMensagem(msg, esquemaApi);
  try {
    return { dados: esquemaDominio.parse(normalizar(dados)), custoCentavos };
  } catch (cause) {
    throw new ExtracaoFalhouError('A resposta da IA veio em formato inesperado. Tente novamente.', { cause, custoCentavos });
  }
}

export function extratorClaude(): Extrator {
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  return {
    async enviarArquivo(pdf) {
      const f = await client.files.upload({
        file: await toFile(pdf, 'edital.pdf', { type: 'application/pdf' }),
      });
      return f.id;
    },
    async listarCargos(fileId) {
      const { dados, custoCentavos } = await chamar(client, fileId, PROMPT_LISTAR_CARGOS, ResumoApi, normalizarResumo, EsquemaEditalResumo);
      if (dados.cargos.length === 0) {
        const erro = new EditalInvalidoError();
        erro.custoCentavos = custoCentavos;
        throw erro;
      }
      return { resumo: dados, custoCentavos };
    },
    async extrairConteudo(fileId, cargo) {
      const { dados, custoCentavos } = await chamar(client, fileId, promptExtrairConteudo(cargo), ConteudoApi, normalizarConteudo, EsquemaConteudoCargoIA);
      return { conteudo: dados, custoCentavos };
    },
  };
}
