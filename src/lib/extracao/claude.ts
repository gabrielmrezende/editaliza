import 'server-only';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
import { PROMPT_LISTAR_CARGOS, promptExtrairConteudo } from './prompts';
import { EditalInvalidoError, type Extrator } from './tipos';

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

async function chamar<A extends z.ZodType, D extends z.ZodType>(
  client: Anthropic,
  fileId: string,
  prompt: string,
  esquemaApi: A,
  esquemaDominio: D,
): Promise<{ dados: z.infer<D>; custoCentavos: number }> {
  const stream = client.beta.messages.stream({
    model: MODELO,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: zodOutputFormat(esquemaApi) },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'file', file_id: fileId } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('A IA recusou-se a ler o documento.');
  if (msg.stop_reason === 'max_tokens') throw new Error('A resposta da IA foi cortada (limite de tokens).');
  const texto = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const dados = esquemaDominio.parse(JSON.parse(texto));
  return { dados, custoCentavos: calcularCustoCentavos(msg.usage.input_tokens, msg.usage.output_tokens) };
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
      if (dados.cargos.length === 0) throw new EditalInvalidoError();
      return { resumo: dados, custoCentavos };
    },
    async extrairConteudo(fileId, cargo) {
      const { dados, custoCentavos } = await chamar(client, fileId, promptExtrairConteudo(cargo), ConteudoApi, EsquemaConteudoCargoIA);
      return { conteudo: dados, custoCentavos };
    },
  };
}
