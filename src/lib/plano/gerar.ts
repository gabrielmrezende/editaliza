import type { Aviso, BlocoEstudo, DiaPlano, DisciplinaPlano, EntradaPlano, PlanoGerado, Topico } from '@/lib/dominio/tipos';
import {
  DIAS_MINIMOS_PARA_RESERVA,
  DIAS_MINIMOS_RESERVA,
  DIAS_POR_SIMULADO,
  FRACAO_RESERVA,
  MINUTOS_MAXIMOS_BLOCO,
  MINUTOS_MINIMOS_CICLO,
  MINUTOS_MINIMOS_TOPICO,
  PASSO_CICLO,
} from './constantes';
import { diaDaSemana, diasEntre, somarDias } from '@/lib/datas';
import { prioridade } from './prioridade';

/** Disciplina com ao menos um tópico pendente, já com prioridade calculada. */
interface Ativa { disciplina: DisciplinaPlano; prio: number; topicos: Topico[] }
/** Resultado da fase de estudo: quanto cada tópico recebe. */
interface Alocacao { id: string; prio: number; alvo: number; minutosTopico: number; topicos: Topico[] }
interface Estado extends Alocacao { indice: number; restante: number; alocado: number }

const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function gerarPlano(entrada: EntradaPlano): PlanoGerado {
  const ativas = selecionarAtivas(entrada);
  if (soma(entrada.minutosPorDia) === 0) {
    const avisos: Aviso[] = [{ tipo: 'sem_tempo' }];
    return entrada.dataProva !== null
      ? { modo: 'prazo', dias: [], inicioReserva: null, avisos }
      : { modo: 'ciclo', ciclo: [], avisos };
  }

  const avisos: Aviso[] = [];
  const semPesos = !entrada.pesosInformados || entrada.disciplinas.every((d) => d.questoes == null && d.pontos == null);
  if (semPesos) avisos.push({ tipo: 'pesos_assumidos' });

  if (entrada.dataProva === null) return gerarCiclo(entrada, ativas, avisos);
  if (entrada.dataProva <= entrada.hoje) {
    avisos.push({ tipo: 'data_invalida' });
    return gerarCiclo(entrada, ativas, avisos);
  }
  return gerarPrazo(entrada, entrada.dataProva, ativas, avisos);
}

function selecionarAtivas(entrada: EntradaPlano): Ativa[] {
  const feitos = new Set(entrada.concluidos);
  return entrada.disciplinas
    .map((disciplina) => ({
      disciplina,
      prio: prioridade(disciplina, entrada.pesosInformados) * (entrada.ajustes?.[disciplina.id] ?? 1),
      topicos: disciplina.topicos.filter((t) => !feitos.has(t.id)),
    }))
    .filter((a) => a.topicos.length > 0);
}

/** Ordem estável por prioridade decrescente (empate: ordem do edital). */
const porPrioridade = (ativas: Ativa[]) => [...ativas].sort((a, b) => b.prio - a.prio);

function gerarCiclo(entrada: EntradaPlano, ativas: Ativa[], avisos: Aviso[]): PlanoGerado {
  const totalSemanal = soma(entrada.minutosPorDia);
  const somaPrio = soma(ativas.map((a) => a.prio));
  const ciclo = porPrioridade(ativas).map((a) => {
    const bruto = (totalSemanal * a.prio) / somaPrio;
    const arredondado = Math.round(bruto / PASSO_CICLO) * PASSO_CICLO;
    return { disciplinaId: a.disciplina.id, minutos: Math.max(MINUTOS_MINIMOS_CICLO, arredondado) };
  });
  return { modo: 'ciclo', ciclo, avisos };
}

function gerarPrazo(entrada: EntradaPlano, dataProva: string, ativas: Ativa[], avisos: Aviso[]): PlanoGerado {
  const nDias = diasEntre(entrada.hoje, dataProva);
  const nReserva =
    nDias >= DIAS_MINIMOS_PARA_RESERVA ? Math.max(DIAS_MINIMOS_RESERVA, Math.round(FRACAO_RESERVA * nDias)) : 0;
  const nEstudo = nDias - nReserva;
  const datas = Array.from({ length: nDias }, (_, i) => somarDias(entrada.hoje, i));
  const minutosDia = datas.map((data) => entrada.minutosPorDia[diaDaSemana(data)]);

  const { alocacoes, fora } = faseEstudo(ativas, soma(minutosDia.slice(0, nEstudo)));
  if (fora.length > 0) avisos.push({ tipo: 'nao_cabe', topicosFora: fora });

  const noPlano = new Set(alocacoes.map((a) => a.id));
  const diasEstudo = agendar(alocacoes, datas.slice(0, nEstudo), minutosDia.slice(0, nEstudo));
  const diasReserva = reservar(datas.slice(nEstudo), minutosDia.slice(nEstudo), porPrioridade(ativas.filter((a) => noPlano.has(a.disciplina.id))));
  return {
    modo: 'prazo',
    dias: [...diasEstudo, ...diasReserva],
    inicioReserva: nReserva > 0 ? datas[nEstudo] : null,
    avisos,
  };
}

/**
 * Corta tópicos só se nem o piso de 45 min por tópico couber; depois distribui por water-filling:
 * disciplinas cuja cota proporcional ficaria abaixo do piso são travadas em 45 × n e o resto é redistribuído.
 */
function faseEstudo(ativas: Ativa[], minutosEstudo: number): { alocacoes: Alocacao[]; fora: string[] } {
  const pool = ativas.map((a) => ({ ...a, topicos: [...a.topicos] }));
  const fora: string[] = [];
  const pisoTotal = () => MINUTOS_MINIMOS_TOPICO * soma(pool.map((a) => a.topicos.length));
  while (pool.length > 0 && pisoTotal() > minutosEstudo) {
    let alvoIdx = 0; // menor prioridade; no empate, a última do edital
    pool.forEach((a, i) => {
      if (a.prio <= pool[alvoIdx].prio) alvoIdx = i;
    });
    fora.push(pool[alvoIdx].topicos.pop()!.id);
    if (pool[alvoIdx].topicos.length === 0) pool.splice(alvoIdx, 1);
  }

  const travadas = new Map<string, number>();
  let restante = minutosEstudo;
  for (;;) {
    const livres = pool.filter((a) => !travadas.has(a.disciplina.id));
    const somaPrio = soma(livres.map((a) => a.prio));
    const novas = livres.filter((a) => (restante * a.prio) / somaPrio / a.topicos.length < MINUTOS_MINIMOS_TOPICO);
    if (novas.length === 0) break;
    for (const a of novas) {
      const minutos = MINUTOS_MINIMOS_TOPICO * a.topicos.length;
      travadas.set(a.disciplina.id, minutos);
      restante -= minutos;
    }
  }
  const somaLivres = soma(pool.filter((a) => !travadas.has(a.disciplina.id)).map((a) => a.prio));
  const alocacoes = pool.map((a): Alocacao => {
    const id = a.disciplina.id;
    const travada = travadas.has(id);
    const alvo = travadas.get(id) ?? (restante * a.prio) / somaLivres;
    const minutosTopico = travada ? MINUTOS_MINIMOS_TOPICO : Math.floor(alvo / a.topicos.length);
    return { id, prio: a.prio, alvo, minutosTopico, topicos: a.topicos };
  });
  return { alocacoes, fora };
}

/** Distribui pedaços de até 60 min pelos dias, intercalando disciplinas pelo maior déficit relativo. */
function agendar(alocacoes: Alocacao[], datas: string[], minutosDia: number[]): DiaPlano[] {
  const estados: Estado[] = alocacoes.map((a) => ({ ...a, indice: 0, restante: a.minutosTopico, alocado: 0 }));
  let anterior: string | null = null;
  return datas.map((data, k) => {
    const blocos: BlocoEstudo[] = [];
    let livre = minutosDia[k];
    while (livre > 0) {
      const e = escolher(estados, anterior);
      if (!e) break;
      const minutos = Math.min(MINUTOS_MAXIMOS_BLOCO, e.restante, livre);
      blocos.push({ disciplinaId: e.id, topicoId: e.topicos[e.indice].id, tipo: 'estudo', minutos });
      e.alocado += minutos;
      e.restante -= minutos;
      livre -= minutos;
      anterior = e.id;
      if (e.restante === 0) {
        e.indice++;
        e.restante = e.indice < e.topicos.length ? e.minutosTopico : 0;
      }
    }
    return { data, blocos };
  });
}

function escolher(estados: Estado[], anterior: string | null): Estado | null {
  const comTrabalho = estados.filter((e) => e.restante > 0);
  const outras = comTrabalho.filter((e) => e.id !== anterior);
  const candidatos = outras.length > 0 ? outras : comTrabalho;
  const deficit = (e: Estado) => (e.alvo - e.alocado) / e.alvo;
  let melhor: Estado | null = null;
  for (const e of candidatos) {
    if (!melhor || deficit(e) > deficit(melhor) || (deficit(e) === deficit(melhor) && e.prio > melhor.prio)) melhor = e;
  }
  return melhor;
}

/** Reserva final: último dia de cada bloco de 7 é simulado; os demais, revisão geral alternando disciplinas. */
function reservar(datas: string[], minutosDia: number[], ordenadas: Ativa[]): DiaPlano[] {
  let proxima = 0;
  return datas.map((data, r) => {
    const minutos = minutosDia[r];
    if (minutos <= 0 || ordenadas.length === 0) return { data, blocos: [] };
    if ((r + 1) % DIAS_POR_SIMULADO === 0) {
      return { data, blocos: [{ disciplinaId: ordenadas[0].disciplina.id, topicoId: null, tipo: 'simulado', minutos }] };
    }
    const alvo = ordenadas[proxima++ % ordenadas.length];
    return { data, blocos: [{ disciplinaId: alvo.disciplina.id, topicoId: null, tipo: 'revisao_geral', minutos }] };
  });
}
