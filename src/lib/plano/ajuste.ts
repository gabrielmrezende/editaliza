import { diaDaSemana, diasEntre, somarDias } from '@/lib/datas';
import type { DisciplinaPlano, ItemCiclo, MinutosPorDia, PlanoGerado } from '@/lib/dominio/tipos';
import {
  ACERTO_ALTO,
  ACERTO_BAIXO,
  AJUSTE_MAX,
  AJUSTE_MIN,
  FATOR_ACERTO_ALTO,
  FATOR_ACERTO_BAIXO,
  FATOR_REVISOES,
  INTERVALO_AJUSTE_DIAS,
  JANELA_ACERTO_DIAS,
  MIN_QUESTOES_ACERTO,
  MIN_REVISOES_ATRASADAS,
} from './constantes';
import { converterPosicaoFila } from './fila';
import { gerarPlano } from './gerar';

/** Item do resumo do ajuste (o texto é montado na tela por `textoDoResumo`). */
export type ItemResumo =
  | { tipo: 'horas'; estudados: number; planejados: number; diasAteProva: number | null }
  | { tipo: 'sem_estudo' }
  | { tipo: 'fila_refeita' }
  | {
      tipo: 'prioridade';
      disciplinaId: string;
      nome: string;
      direcao: 'sobe' | 'desce' | 'normal';
      /** null quando a matéria agora tem menos de 10 questões na janela. */
      percentual: number | null;
      questoes: number;
    }
  | { tipo: 'revisoes_atrasadas'; disciplinaId: string; nome: string; quantidade: number }
  | { tipo: 'nao_cabe'; agora: number; antes: number }
  | { tipo: 'em_dia' };

export interface EntradaAjuste {
  conteudo: DisciplinaPlano[];
  gerado: PlanoGerado;
  dataProva: string | null;
  minutosPorDia: MinutosPorDia;
  pesosInformados: boolean;
  /** Data (aaaa-mm-dd) de criação do plano. */
  criadoEm: string;
  /** Fatores só de acerto do ajuste anterior (chave ausente = ×1). */
  fatoresAcertoVigentes: Record<string, number>;
  /** Posição atual da fila (`planos.fila_posicao`). */
  posicaoAtual: number;
  sessoes: { data: string; disciplinaId: string; minutos: number; acertos: number; erros: number }[];
  concluidos: string[];
  revisoesPendentes: { disciplinaId: string; dataRevisao: string }[];
  hoje: string;
}

export interface ResultadoAjuste {
  gerado: PlanoGerado;
  ajustes: Record<string, number>;
  /** Fatores só de acerto deste ajuste (matérias com ×1 ficam de fora), para comparar no próximo. */
  fatoresAcerto: Record<string, number>;
  /** Nova posição da fila e início dela; null = manter `fila_posicao` e `fila_desde`. `desde` null = manter `fila_desde`. */
  fila: { posicao: number; desde: string | null } | null;
  resumo: ItemResumo[];
  janela: { inicio: string; fim: string };
}

const MAX_ITENS_RESUMO = 5;
const MAX_ITENS_PRIORIDADE = 2;
const MS_DIA = 86_400_000;

interface Acerto { acertos: number; questoes: number; fator: number }

/** Acerto por matéria em [hoje − 28, hoje − 1]; fator ≠ 1 só com ≥ 10 questões. */
function acertosPorMateria(e: EntradaAjuste): Map<string, Acerto> {
  const inicio = somarDias(e.hoje, -JANELA_ACERTO_DIAS);
  const totais = new Map<string, { acertos: number; questoes: number }>();
  for (const s of e.sessoes) {
    if (s.data < inicio || s.data >= e.hoje) continue;
    const t = totais.get(s.disciplinaId) ?? { acertos: 0, questoes: 0 };
    t.acertos += s.acertos;
    t.questoes += s.acertos + s.erros;
    totais.set(s.disciplinaId, t);
  }
  const resultado = new Map<string, Acerto>();
  for (const [id, t] of totais) {
    const taxa = t.questoes > 0 ? t.acertos / t.questoes : 0;
    const fator =
      t.questoes < MIN_QUESTOES_ACERTO ? 1 : taxa < ACERTO_BAIXO ? FATOR_ACERTO_BAIXO : taxa >= ACERTO_ALTO ? FATOR_ACERTO_ALTO : 1;
    resultado.set(id, { ...t, fator });
  }
  return resultado;
}

/** Fatores de acerto ≠ 1 das matérias do conteúdo. */
function calcularFatoresAcerto(e: EntradaAjuste): Record<string, number> {
  const acertos = acertosPorMateria(e);
  const fatores: Record<string, number> = {};
  for (const d of e.conteudo) {
    const fator = acertos.get(d.id)?.fator ?? 1;
    if (fator !== 1) fatores[d.id] = fator;
  }
  return fatores;
}

/** Revisões pendentes com data anterior a hoje, por matéria. */
function atrasadasPorMateria(e: EntradaAjuste): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const r of e.revisoesPendentes) {
    if (r.dataRevisao < e.hoje) contagem.set(r.disciplinaId, (contagem.get(r.disciplinaId) ?? 0) + 1);
  }
  return contagem;
}

/** Multiplicador por matéria do conteúdo, recalculado do zero; matérias com ×1 ficam de fora. */
export function calcularMultiplicadores(e: EntradaAjuste): Record<string, number> {
  const acertos = acertosPorMateria(e);
  const atrasadas = atrasadasPorMateria(e);
  const ajustes: Record<string, number> = {};
  for (const d of e.conteudo) {
    const fatorRevisoes = (atrasadas.get(d.id) ?? 0) >= MIN_REVISOES_ATRASADAS ? FATOR_REVISOES : 1;
    const produto = (acertos.get(d.id)?.fator ?? 1) * fatorRevisoes;
    const limitado = Math.min(AJUSTE_MAX, Math.max(AJUSTE_MIN, produto));
    const arredondado = Math.round(limitado * 100) / 100;
    if (arredondado !== 1) ajustes[d.id] = arredondado;
  }
  return ajustes;
}

const totalForaDoPlano = (g: PlanoGerado) =>
  g.avisos.reduce((s, a) => (a.tipo === 'nao_cabe' ? s + a.topicosFora.length : s), 0);

/** Novo ciclo na ordem do antigo (matérias novas no fim, na ordem em que vieram). */
function naOrdemAntiga(antigo: ItemCiclo[], novo: ItemCiclo[]): ItemCiclo[] {
  const posicao = new Map(antigo.map((i, k) => [i.disciplinaId, k]));
  const ordem = (i: ItemCiclo) => posicao.get(i.disciplinaId) ?? antigo.length;
  return novo.map((item, k) => ({ item, k })).sort((a, b) => ordem(a.item) - ordem(b.item) || a.k - b.k).map((x) => x.item);
}

export function ajustarPlano(e: EntradaAjuste): ResultadoAjuste {
  const ajustes = calcularMultiplicadores(e);
  const amanha = somarDias(e.hoje, 1);
  const base = { disciplinas: e.conteudo, minutosPorDia: e.minutosPorDia, concluidos: e.concluidos, pesosInformados: e.pesosInformados, ajustes };

  let gerado = e.gerado;
  let fila: ResultadoAjuste['fila'] = null;
  let diasAteProva: number | null = null;
  if (e.gerado.modo === 'prazo') {
    if (e.dataProva !== null && e.dataProva > amanha) {
      const novo = gerarPlano({ ...base, dataProva: e.dataProva, hoje: amanha });
      if (novo.modo === 'prazo') {
        gerado = { ...novo, dias: [...e.gerado.dias.filter((d) => d.data <= e.hoje), ...novo.dias] };
        diasAteProva = diasEntre(e.hoje, e.dataProva);
        fila = { posicao: 0, desde: amanha };
      }
    }
  } else {
    // Mantém o modo ciclo (inclusive o aviso data_invalida, se a data já passou).
    const dataProva = e.dataProva !== null && e.dataProva <= e.hoje ? e.dataProva : null;
    const novo = gerarPlano({ ...base, dataProva, hoje: e.hoje });
    if (novo.modo === 'ciclo') {
      const ciclo = naOrdemAntiga(e.gerado.ciclo, novo.ciclo);
      gerado = { ...novo, ciclo };
      fila = { posicao: converterPosicaoFila(e.gerado.ciclo, e.posicaoAtual, ciclo), desde: null };
    }
  }

  const inicio = [somarDias(e.hoje, -INTERVALO_AJUSTE_DIAS), e.criadoEm].sort().at(-1)!;
  const janela = { inicio, fim: somarDias(e.hoje, -1) };

  const resumo: ItemResumo[] = [];
  const horas = itemDeHoras(e, janela, diasAteProva);
  if (horas) resumo.push(horas);
  if (e.gerado.modo === 'prazo' && fila !== null) resumo.push({ tipo: 'fila_refeita' });
  resumo.push(...itensDePrioridade(e));
  const revisoes = itemDeRevisoes(e);
  if (revisoes) resumo.push(revisoes);
  const antes = totalForaDoPlano(e.gerado);
  const agora = totalForaDoPlano(gerado);
  if (agora !== antes) resumo.push({ tipo: 'nao_cabe', agora, antes });

  return {
    gerado,
    ajustes,
    fatoresAcerto: calcularFatoresAcerto(e),
    fila,
    resumo: resumo.length > 0 ? resumo.slice(0, MAX_ITENS_RESUMO) : [{ tipo: 'em_dia' }],
    janela,
  };
}

function itemDeHoras(e: EntradaAjuste, janela: { inicio: string; fim: string }, diasAteProva: number | null): ItemResumo | null {
  if (janela.inicio > janela.fim) return null;
  const naJanela = (data: string) => data >= janela.inicio && data <= janela.fim;
  let planejados = 0;
  if (e.gerado.modo === 'prazo') {
    for (const d of e.gerado.dias) if (naJanela(d.data)) planejados += d.blocos.reduce((s, b) => s + b.minutos, 0);
  } else {
    for (let data = janela.inicio; data <= janela.fim; data = somarDias(data, 1)) planejados += e.minutosPorDia[diaDaSemana(data)];
  }
  if (planejados === 0) return null;
  const estudados = e.sessoes.reduce((s, x) => (naJanela(x.data) ? s + x.minutos : s), 0);
  if (estudados === 0) return { tipo: 'sem_estudo' };
  return { tipo: 'horas', estudados, planejados, diasAteProva };
}

/** Matérias cujo fator de acerto difere do vigente; no máximo 2, maiores mudanças primeiro. */
function itensDePrioridade(e: EntradaAjuste): ItemResumo[] {
  const acertos = acertosPorMateria(e);
  const itens: { mudanca: number; item: ItemResumo }[] = [];
  for (const d of e.conteudo) {
    const a = acertos.get(d.id) ?? { acertos: 0, questoes: 0, fator: 1 };
    const vigente = e.fatoresAcertoVigentes[d.id] ?? 1;
    if (a.fator === vigente) continue;
    const direcao = a.fator === 1 ? 'normal' : a.fator > vigente ? 'sobe' : 'desce';
    const taxa = (100 * a.acertos) / a.questoes;
    // "sobe" arredonda para baixo: 59,6% vira 59%, nunca "60%" contradizendo a regra de < 60%.
    const percentual = a.questoes < MIN_QUESTOES_ACERTO ? null : direcao === 'sobe' ? Math.floor(taxa) : Math.round(taxa);
    itens.push({
      mudanca: Math.abs(a.fator - vigente),
      item: { tipo: 'prioridade', disciplinaId: d.id, nome: d.nome, direcao, percentual, questoes: a.questoes },
    });
  }
  return itens
    .map((x, k) => ({ ...x, k }))
    .sort((a, b) => b.mudanca - a.mudanca || a.k - b.k)
    .slice(0, MAX_ITENS_PRIORIDADE)
    .map((x) => x.item);
}

/** A matéria com mais revisões atrasadas (≥ 2); no empate, a primeira do edital. */
function itemDeRevisoes(e: EntradaAjuste): ItemResumo | null {
  const atrasadas = atrasadasPorMateria(e);
  let melhor: { disciplinaId: string; nome: string; quantidade: number } | null = null;
  for (const d of e.conteudo) {
    const quantidade = atrasadas.get(d.id) ?? 0;
    if (quantidade >= MIN_REVISOES_ATRASADAS && (!melhor || quantidade > melhor.quantidade)) {
      melhor = { disciplinaId: d.id, nome: d.nome, quantidade };
    }
  }
  return melhor ? { tipo: 'revisoes_atrasadas', ...melhor } : null;
}

/** O último ajuste (ou a criação) foi há 7 dias ou mais? */
export function ajusteVencido(referencia: Date, agora: Date): boolean {
  return agora.getTime() - referencia.getTime() >= INTERVALO_AJUSTE_DIAS * MS_DIA;
}
