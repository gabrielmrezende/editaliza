import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import { estiloMateria } from '@/components/cores';
import { cartao } from '@/components/estilos';
import { dataPorExtenso } from '@/lib/datas';
import { formatarMinutos } from '@/lib/formatar';
import type { Orientacao, Periodo, Relatorio } from '@/lib/acompanhamento/relatorio';

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: 'semana', rotulo: 'Esta semana' },
  { valor: 'semana_passada', rotulo: 'Semana passada' },
  { valor: '30dias', rotulo: '30 dias' },
  { valor: 'plano', rotulo: 'Desde o início do plano' },
];

const DIAS_SEM_ESTUDO_AVISO = 7;
const FORMATO_DATA: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

const porcento = (fracao: number) => `${Math.round(fracao * 100)}%`;

/** "+20% vs. período anterior"; sem base de comparação, mostra o valor anterior. */
function variacao(atual: number, anterior: number, formatarAnterior: (v: number) => string): string {
  if (anterior <= 0) return `Período anterior: ${formatarAnterior(anterior)}`;
  const delta = Math.round(((atual - anterior) / anterior) * 100);
  return `${delta > 0 ? '+' : ''}${delta}% vs. período anterior`;
}

function variacaoAcerto(atual: number | null, anterior: number | null): string {
  if (anterior === null) return 'Período anterior: sem questões';
  if (atual === null) return `Período anterior: ${anterior}%`;
  const delta = atual - anterior;
  return `${delta > 0 ? '+' : ''}${delta} p.p. vs. período anterior`;
}

const horasZero = (m: number) => (m <= 0 ? '0h' : formatarMinutos(m));

function textoOrientacao(o: Orientacao): string {
  switch (o.tipo) {
    case 'reforcar':
      return `Considere reforçar ${o.topicoNome} (${o.percentual}% em ${o.questoes} questões).`;
    case 'uma_materia':
      return 'Todo o tempo ficou em uma matéria. Compare com o seu plano.';
    case 'revisoes_atrasadas':
      return o.quantidade === 1 ? 'Há 1 revisão atrasada.' : `Há ${o.quantidade} revisões atrasadas.`;
    case 'sem_estudo':
      return 'Nenhum estudo registrado neste período.';
    case 'menos_que_anterior':
      return 'Você estudou menos que no período anterior. Confira se o tempo planejado continua viável.';
  }
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-superficie p-4 sm:p-5">
      <dt className="text-sm font-semibold text-texto-suave">{rotulo}</dt>
      <dd className="flex flex-col gap-1">
        <span className="text-3xl font-extrabold leading-none tracking-tight">{valor}</span>
        {nota && <span className="text-xs font-medium text-texto-suave">{nota}</span>}
      </dd>
    </div>
  );
}

function NumeroPequeno({ rotulo, valor, alerta = false }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="flex flex-col gap-1 pt-3">
      <dt className="text-xs font-semibold text-texto-suave">{rotulo}</dt>
      <dd className={`text-2xl font-extrabold leading-none ${alerta ? 'text-rust-texto' : ''}`}>{valor}</dd>
    </div>
  );
}

/** Barra só de CSS; o valor em texto ao lado carrega a informação (a cor não é a única pista). */
function Barra({ rotulo, fracao, cheia }: { rotulo: string; fracao: number; cheia: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold text-texto-suave">{rotulo}</span>
      <div aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-superficie-alt ring-1 ring-borda ring-inset">
        <div
          className={`barra h-full rounded-full ${
            cheia ? 'bg-[var(--cor-materia,var(--acao))] shadow-[inset_0_0_0_1px_var(--anel-bolinha)]' : 'bg-borda-forte'
          }`}
          style={{ width: porcento(Math.min(1, fracao)) }}
        />
      </div>
      <span className="w-11 shrink-0 text-right text-xs font-bold">{porcento(fracao)}</span>
    </div>
  );
}

const titulo = 'text-lg font-extrabold tracking-tight';

export function PainelRelatorio({
  relatorio: r,
  periodo,
  indices,
}: {
  relatorio: Relatorio;
  periodo: Periodo;
  /** Matéria do plano → posição (cor da bolinha). */
  indices: Map<string, number>;
}) {
  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <nav aria-label="Período do relatório" className="flex flex-col gap-2">
        <ul className="flex w-fit max-w-full flex-wrap gap-1 rounded-cartao border border-borda bg-superficie p-1 shadow-cartao">
          {PERIODOS.map((p) => {
            const atual = p.valor === periodo;
            return (
              <li key={p.valor}>
                <Link
                  href={`/app/relatorio?periodo=${p.valor}`}
                  aria-current={atual ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-linha px-3.5 text-sm font-bold transition-colors ${
                    atual ? 'bg-acao text-na-acao' : 'text-texto-medio hover:bg-superficie-alt hover:text-texto'
                  }`}
                >
                  {p.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-texto-suave">
          De {dataPorExtenso(r.intervalo.inicio, FORMATO_DATA)} a {dataPorExtenso(r.intervalo.fim, FORMATO_DATA)}.
        </p>
      </nav>

      <section aria-label="Resumo do período">
        {/* Um só cartão com quatro números (fio de 1 px entre eles), não quatro cartões iguais. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-cartao border border-borda bg-borda shadow-cartao lg:grid-cols-4">
          <Numero rotulo="Horas" valor={formatarMinutos(r.minutos)} nota={variacao(r.minutos, r.anterior.minutos, horasZero)} />
          <Numero rotulo="Questões" valor={String(r.questoes)} nota={variacao(r.questoes, r.anterior.questoes, String)} />
          <Numero
            rotulo="Acerto"
            valor={r.percentualAcerto === null ? '—' : `${r.percentualAcerto}%`}
            nota={variacaoAcerto(r.percentualAcerto, r.anterior.percentualAcerto)}
          />
          <Numero
            rotulo="Dias com estudo"
            valor={String(r.diasComEstudo)}
            nota={variacao(r.diasComEstudo, r.anterior.diasComEstudo, String)}
          />
        </dl>
      </section>

      {r.orientacoes.length > 0 && (
        <section
          aria-labelledby="rel-orientacoes"
          className="flex gap-3 rounded-cartao border border-borda border-l-4 border-l-aviso bg-superficie p-4 shadow-cartao sm:p-5"
        >
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-aviso" />
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="rel-orientacoes" className={titulo}>
              Orientações
            </h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-texto-medio marker:text-aviso">
              {r.orientacoes.map((o) => (
                <li key={o.tipo}>{textoOrientacao(o)}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="rel-materias" className={`${cartao} flex flex-col gap-4 p-4 sm:p-5`}>
          <div>
            <h2 id="rel-materias" className={titulo}>
              Por matéria
            </h2>
            <p className="text-sm text-texto-suave">Parte do tempo estudado e parte do tempo planejado em cada matéria.</p>
          </div>
          <ul className="flex flex-col gap-5">
            {r.porDisciplina.map((d) => {
              const indice = indices.get(d.disciplinaId);
              return (
                <li
                  key={d.disciplinaId}
                  className="flex flex-col gap-1.5"
                  style={indice !== undefined ? estiloMateria(indice) : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-bold leading-snug">
                      <span aria-hidden className="bolinha" />
                      {d.nome}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-texto-suave">{formatarMinutos(d.minutos)}</span>
                  </div>
                  <Barra rotulo="Estudado" fracao={d.fracaoEstudada} cheia />
                  <Barra rotulo="Planejado" fracao={d.fracaoPlanejada} cheia={false} />
                  {d.diasSemEstudo !== null && d.diasSemEstudo >= DIAS_SEM_ESTUDO_AVISO && (
                    <p className="text-xs font-bold text-rust-texto">sem estudo há {d.diasSemEstudo} dias</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="rel-reforcar" className={`${cartao} flex flex-col gap-3 p-4 sm:p-5`}>
            <h2 id="rel-reforcar" className={titulo}>
              Assuntos para reforçar
            </h2>
            {r.reforcar.length === 0 ? (
              <p className="text-sm text-texto-suave">
                Sem assuntos com pelo menos 5 questões e acerto abaixo de 70% neste período.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-borda">
                {r.reforcar.map((t) => (
                  <li key={t.topicoId} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
                    <span className="font-bold leading-snug">{t.topicoNome}</span>
                    <span className="text-sm text-texto-suave">
                      {t.disciplinaNome}:{' '}
                      <span className="font-semibold text-rust-texto">
                        {t.percentual}% de acerto em {t.questoes} questões
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="rel-revisoes" className={`${cartao} flex flex-col gap-1 p-4 sm:p-5`}>
            <h2 id="rel-revisoes" className={titulo}>
              {periodo === 'semana' ? 'Revisões da semana' : 'Revisões do período'}
            </h2>
            <dl className="grid grid-cols-3">
              <NumeroPequeno rotulo="Agendadas" valor={r.revisoes.agendadas} />
              <NumeroPequeno rotulo="Concluídas" valor={r.revisoes.concluidas} />
              <NumeroPequeno rotulo="Atrasadas" valor={r.revisoes.atrasadas} alerta={r.revisoes.atrasadas > 0} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
