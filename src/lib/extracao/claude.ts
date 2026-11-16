import 'server-only';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
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
  esquemaDominio: D,
): Promise<{ dados: z.infer<D>; custoCentavos: number }> {
  const msg = await client.beta.messages.stream(montarRequisicao(fileId, prompt, esquemaApi)).finalMessage();
  return lerMensagem(msg, esquemaDominio);
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
      const { dados, custoCentavos } = await chamar(client, fileId, PROMPT_LISTAR_CARGOS, ResumoApi, EsquemaEditalResumo);
      if (dados.cargos.length === 0) {
        const erro = new EditalInvalidoError();
        erro.custoCentavos = custoCentavos;
        throw erro;
      }
      return { resumo: dados, custoCentavos };
    },
    async extrairConteudo(fileId, cargo) {
      const { dados, custoCentavos } = await chamar(client, fileId, promptExtrairConteudo(cargo), ConteudoApi, EsquemaConteudoCargoIA);
      return { conteudo: dados, custoCentavos };
    },
  };
}
