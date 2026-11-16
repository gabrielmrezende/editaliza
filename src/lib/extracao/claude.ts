import 'server-only';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo, type ConteudoCargoIA } from '@/lib/dominio/esquemas';
import type { EditalResumo } from '@/lib/dominio/tipos';
import { PROMPT_LISTAR_CARGOS, promptExtrairConteudo } from './prompts';
import { EditalInvalidoError, ExtracaoFalhouError, type Extrator } from './tipos';

export const MODELOS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type ModeloExtracao = (typeof MODELOS)[number];
const MODELO_PADRAO: ModeloExtracao = 'claude-haiku-5-5';

/** Modelo da leitura: EXTRACAO_MODELO (ausente = haiku); valor fora da lista é erro de configuração. */
export function escolherModelo(valor: string | undefined): ModeloExtracao {
  if (valor === undefined || valor.trim() === '') return MODELO_PADRAO;
  const modelo = valor.trim();
  if ((MODELOS as readonly string[]).includes(modelo)) return modelo as ModeloExtracao;
  throw new Error(`EXTRACAO_MODELO inválido: "${valor}". Use um destes: ${MODELOS.join(', ')}.`);
}

const DOLAR_EM_CENTAVOS = 550;
const LIMITE_HAIKU_TOKENS = 100_000;
// US$ por milhão de tokens (entrada / saída).
const PRECOS = {
  'claude-opus-5-5': { entrada: 4, saida: 20 },
  'claude-sonnet-5-5': { entrada: 2, saida: 10 },
} as const;
const PRECOS_HAIKU = { ate100k: { entrada: 0.1, saida: 0.5 }, acima100k: { entrada: 0.5, saida: 2.5 } } as const;

export type UsoTokens = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Custo em centavos de real (arredondado para cima). Escrita em cache = 1,25× a entrada; leitura = 0,1×. */
export function calcularCustoCentavos(modelo: ModeloExtracao, uso: UsoTokens): number {
  const escrita = uso.cache_creation_input_tokens ?? 0;
  const leitura = uso.cache_read_input_tokens ?? 0;
  const preco =
    modelo === 'claude-haiku-5-5'
      ? uso.input_tokens + escrita + leitura <= LIMITE_HAIKU_TOKENS
        ? PRECOS_HAIKU.ate100k
        : PRECOS_HAIKU.acima100k
      : PRECOS[modelo];
  const entrada = uso.input_tokens + 1.25 * escrita + 0.1 * leitura;
  const usd = (entrada * preco.entrada + uso.output_tokens * preco.saida) / 1_000_000;
  // toFixed afasta ruído de ponto flutuante (ex.: 2200.0000000001 não pode virar 2201).
  return Math.ceil(Number((usd * DOLAR_EM_CENTAVOS).toFixed(6)));
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

/**
 * Esquema de saída ÚNICO das duas etapas: o schema JSON faz parte do prefixo da requisição, então
 * schemas diferentes em listarCargos/extrairConteudo invalidariam o cache do PDF. Cada etapa preenche
 * o seu campo e devolve null no outro.
 */
export const ESQUEMA_SAIDA = z.object({
  resumo: ResumoApi.nullable(),
  conteudo: ConteudoApi.nullable(),
});
const FORMATO_SAIDA = zodOutputFormat(ESQUEMA_SAIDA);

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

/**
 * Corpo da requisição. Tudo até o fim do bloco do documento (model, max_tokens, output_config com o
 * esquema único, betas/fallbacks, sem system, o document com cache) é idêntico nas duas etapas e em
 * qualquer cargo; só o texto final (instrução da etapa) muda, depois do breakpoint de cache.
 * Só opus/sonnet têm fallback no servidor (beta); o haiku vai sem `betas`/`fallbacks`.
 */
export function montarRequisicao(modelo: ModeloExtracao, fileId: string, prompt: string) {
  const base = {
    model: modelo,
    max_tokens: 64000,
    output_config: { effort: 'medium' as const, format: FORMATO_SAIDA },
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
  if (modelo === 'claude-haiku-5-5') return base;
  return { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };
}

type MensagemFinal = {
  stop_reason: string | null | undefined;
  content: { type: string; text?: string }[];
  usage: UsoTokens;
};

/** Custo calculado ANTES de interpretar: uma resposta inválida também é cobrada e vai no erro. */
export function lerMensagem<D extends z.ZodType>(msg: MensagemFinal, esquema: D, modelo: ModeloExtracao): { dados: z.infer<D>; custoCentavos: number } {
  const custoCentavos = calcularCustoCentavos(modelo, msg.usage);
  const texto = msg.content.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
  try {
    return { dados: interpretarResposta(msg.stop_reason, texto, esquema), custoCentavos };
  } catch (erro) {
    if (erro instanceof ExtracaoFalhouError) erro.custoCentavos = custoCentavos;
    throw erro;
  }
}

async function chamar<K extends 'resumo' | 'conteudo', D extends z.ZodType>(
  client: Anthropic,
  modelo: ModeloExtracao,
  etapa: 'listar_cargos' | 'extrair_conteudo',
  fileId: string,
  prompt: string,
  campo: K,
  normalizar: (bruto: NonNullable<z.infer<typeof ESQUEMA_SAIDA>[K]>) => z.input<D>,
  esquemaDominio: D,
): Promise<{ dados: z.infer<D>; custoCentavos: number }> {
  const req = montarRequisicao(modelo, fileId, prompt);
  const msg =
    'betas' in req ? await client.beta.messages.stream(req).finalMessage() : await client.messages.stream(req).finalMessage();
  // Registrado antes de interpretar: chamada inválida também é cobrada. O file_id identifica o edital
  // (editais.anthropic_file_id); serve para comparar modelos no teste real.
  const u = msg.usage;
  console.info(
    `[extracao] arquivo=${fileId} etapa=${etapa} modelo=${modelo} entrada=${u.input_tokens} saida=${u.output_tokens} ` +
      `cache_leitura=${u.cache_read_input_tokens ?? 0} cache_escrita=${u.cache_creation_input_tokens ?? 0} ` +
      `centavos=${calcularCustoCentavos(modelo, u)}`,
  );
  const { dados, custoCentavos } = lerMensagem(msg, ESQUEMA_SAIDA, modelo);
  try {
    const parte = dados[campo];
    if (parte === null) throw new Error(`campo "${campo}" ausente na resposta`);
    return { dados: esquemaDominio.parse(normalizar(parte as NonNullable<typeof parte>)), custoCentavos };
  } catch (cause) {
    throw new ExtracaoFalhouError('A resposta da IA veio em formato inesperado. Tente novamente.', { cause, custoCentavos });
  }
}

export function extratorClaude(): Extrator {
  const modelo = escolherModelo(process.env.EXTRACAO_MODELO); // erro claro se inválido
  const client = new Anthropic(); // lê ANTHROPIC_API_KEY
  return {
    async enviarArquivo(pdf) {
      const f = await client.files.upload({
        file: await toFile(pdf, 'edital.pdf', { type: 'application/pdf' }),
      });
      return f.id;
    },
    async listarCargos(fileId) {
      const { dados, custoCentavos } = await chamar(client, modelo, 'listar_cargos', fileId, PROMPT_LISTAR_CARGOS, 'resumo', normalizarResumo, EsquemaEditalResumo);
      if (dados.cargos.length === 0) {
        const erro = new EditalInvalidoError();
        erro.custoCentavos = custoCentavos;
        throw erro;
      }
      return { resumo: dados, custoCentavos };
    },
    async extrairConteudo(fileId, cargo) {
      const { dados, custoCentavos } = await chamar(client, modelo, 'extrair_conteudo', fileId, promptExtrairConteudo(cargo), 'conteudo', normalizarConteudo, EsquemaConteudoCargoIA);
      return { conteudo: dados, custoCentavos };
    },
  };
}
