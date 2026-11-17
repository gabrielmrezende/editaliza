'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { dataPorExtenso } from '@/lib/datas';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import {
  gradeDoMes,
  mesValido,
  mesVizinho,
  montarCalendario,
  projetarFila,
  rotuloDoDia,
  type DiaCalendario,
} from '@/lib/plano/calendario';
import type { Fila } from '@/lib/plano/fila';
import { DetalheDia } from './DetalheDia';

const SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Minutos curtos para a célula do dia: 45 → "45min"; 90 → "1h30"; 120 → "2h". */
function curto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

const navegacao =
  'grid size-11 place-items-center rounded-linha text-texto-medio transition-colors hover:bg-superficie-alt hover:text-texto';

/**
 * Calendário do mês (`?mes=aaaa-mm`): horas estudadas nos dias passados e hoje, previsão da fila nos
 * futuros (tom apagado) e revisões de cada dia. Clicar num dia mostra o detalhe logo abaixo.
 */
export function Calendario({
  mes,
  hoje,
  fila,
  posicao,
  minutosPorDia,
  dataProva,
  sessoes,
  revisoes,
  disciplinas,
  indices,
  erroRevisao,
  aoConcluirRevisao,
}: {
  mes: string;
  hoje: string;
  fila: Fila;
  posicao: number;
  minutosPorDia: number[];
  /** Só no prazo: a projeção para antes da prova. */
  dataProva: string | null;
  sessoes: Sessao[];
  revisoes: Revisao[];
  disciplinas: DisciplinaPlano[];
  indices: Map<string, number>;
  erroRevisao: string | null;
  aoConcluirRevisao: (id: string, concluida: boolean) => void;
}) {
  const id = useId();
  const dias = useMemo(() => {
    const grade = gradeDoMes(mes);
    const ate = grade[grade.length - 1];
    const registradosHoje = sessoes.filter((s) => s.data === hoje).reduce((t, s) => t + s.minutos, 0);
    // Mês todo no passado: sem projeção.
    const projecao =
      ate < hoje ? new Map() : projetarFila({ fila, posicao, minutosPorDia, hoje, registradosHoje, dataProva, ate });
    return montarCalendario({ mes, hoje, sessoes, revisoes, projecao });
  }, [mes, hoje, fila, posicao, minutosPorDia, dataProva, sessoes, revisoes]);

  // Dia escolhido: hoje, quando está no mês; ao trocar de mês, volta a essa regra.
  const inicial = hoje.startsWith(`${mes}-`) ? hoje : null;
  const [mesVisto, setMesVisto] = useState(mes);
  const [escolhido, setEscolhido] = useState<string | null>(inicial);
  if (mes !== mesVisto) {
    setMesVisto(mes);
    setEscolhido(inicial);
  }
  const dia = dias.find((d) => d.data === escolhido) ?? null;

  const mesAtual = hoje.slice(0, 7);
  const titulo = dataPorExtenso(`${mes}-01`, { month: 'long', year: 'numeric' });
  const vizinho = (delta: -1 | 1) => {
    const alvo = mesVizinho(mes, delta);
    return mesValido(alvo, hoje) === alvo ? alvo : null;
  };
  const anterior = vizinho(-1);
  const proximo = vizinho(1);
  const href = (m: string) => (m === mesAtual ? '/app/plano' : `/app/plano?mes=${m}`);

  return (
    <section aria-label="Calendário" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-titulo`} className="text-xl font-semibold tracking-tight first-letter:uppercase">
          {titulo}
        </h2>
        <div className="-my-2 flex items-center">
          {mes !== mesAtual && (
            <Link href="/app/plano" scroll={false} className="inline-flex min-h-11 items-center rounded-linha px-3 text-sm text-link underline-offset-4 hover:underline">
              Hoje
            </Link>
          )}
          {anterior ? (
            <Link href={href(anterior)} scroll={false} aria-label="Mês anterior" className={navegacao}>
              <ChevronLeft aria-hidden className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className={`${navegacao} opacity-40`}>
              <ChevronLeft className="size-5" />
            </span>
          )}
          {proximo ? (
            <Link href={href(proximo)} scroll={false} aria-label="Próximo mês" className={navegacao}>
              <ChevronRight aria-hidden className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className={`${navegacao} opacity-40`}>
              <ChevronRight className="size-5" />
            </span>
          )}
        </div>
      </div>

      <div className="rounded-cartao border border-borda bg-superficie p-1 shadow-cartao sm:p-3">
        <div className="grid grid-cols-7 gap-0.5 pb-1 text-center sm:gap-1 text-sm text-texto-suave">
          {SEMANA.map((nome) => (
            <span key={nome}>
              <span aria-hidden>{nome[0]}</span>
              <span className="sr-only">{nome}</span>
            </span>
          ))}
        </div>
        <div role="group" aria-labelledby={`${id}-titulo`} className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {dias.map((d) => (
            <BotaoDia key={d.data} dia={d} escolhido={d.data === escolhido} aoEscolher={() => setEscolhido(d.data)} />
          ))}
        </div>
      </div>

      <DetalheDia
        dia={dia}
        hoje={hoje}
        fila={fila}
        sessoes={sessoes}
        revisoes={revisoes}
        disciplinas={disciplinas}
        indices={indices}
        erroRevisao={erroRevisao}
        aoConcluirRevisao={aoConcluirRevisao}
      />
    </section>
  );
}

function BotaoDia({ dia, escolhido, aoEscolher }: { dia: DiaCalendario; escolhido: boolean; aoEscolher: () => void }) {
  const previstos = dia.previstos.reduce((t, b) => t + b.minutos, 0);
  const futuro = !dia.passado && !dia.ehHoje;
  const borda = dia.ehHoje ? 'border-2 border-link' : escolhido ? 'border border-borda-forte' : 'border border-transparent';
  const fundo = escolhido ? 'bg-suave' : 'hover:bg-superficie-alt';
  return (
    <button
      type="button"
      aria-label={rotuloDoDia(dia)}
      aria-pressed={escolhido}
      onClick={aoEscolher}
      className={`flex min-h-14 min-w-0 flex-col items-center justify-start gap-0.5 rounded-linha px-0.5 py-1 text-center leading-tight transition-colors sm:min-h-16 ${borda} ${fundo} ${dia.doMes ? '' : 'opacity-45'}`}
    >
      <span className={`tabular-nums ${dia.ehHoje ? 'font-semibold text-texto' : 'text-texto-medio'}`}>
        {Number(dia.data.slice(8))}
      </span>
      {dia.minutosEstudados > 0 ? (
        <span className="text-[13px] tabular-nums text-texto">{curto(dia.minutosEstudados)}</span>
      ) : previstos > 0 && (futuro || dia.ehHoje) ? (
        <span className="text-[13px] tabular-nums text-texto-suave">{curto(previstos)}</span>
      ) : null}
      {dia.revisoesPendentes > 0 ? (
        <span className="flex items-center gap-1 text-[13px] tabular-nums text-rust-texto">
          <span aria-hidden className="size-1.5 rounded-full bg-rust" />
          {dia.revisoesPendentes}
        </span>
      ) : dia.revisoesFeitas > 0 ? (
        <span className="flex items-center gap-1 text-[13px] tabular-nums text-texto-suave">
          <span aria-hidden className="size-1.5 rounded-full bg-ok" />
          {dia.revisoesFeitas}
        </span>
      ) : null}
    </button>
  );
}
