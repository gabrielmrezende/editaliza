import Link from 'next/link';
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
    <div className="flex flex-col gap-1 rounded-xl border border-linha bg-folha p-4">
      <dt className="text-sm font-bold text-tinta-suave">{rotulo}</dt>
      <dd className="flex flex-col gap-1">
        <span className="text-3xl font-bold leading-none tracking-tight">{valor}</span>
        {nota && <span className="text-sm text-tinta-suave">{nota}</span>}
      </dd>
    </div>
  );
}

/** Barra só de CSS; o valor em texto ao lado carrega a informação (a cor não é a única pista). */
function Barra({ rotulo, fracao, cheia }: { rotulo: string; fracao: number; cheia: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-sm text-tinta-suave">{rotulo}</span>
      <div aria-hidden className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-papel ring-1 ring-linha">
        <div className={`h-full rounded-full ${cheia ? 'bg-caneta' : 'bg-tinta-suave/60'}`} style={{ width: porcento(Math.min(1, fracao)) }} />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-bold">{porcento(fracao)}</span>
    </div>
  );
}

const cartao = 'flex flex-col gap-4 rounded-xl border border-linha bg-folha p-4 sm:p-5';
const titulo = 'text-xl font-bold tracking-tight';

export function PainelRelatorio({ relatorio: r, periodo }: { relatorio: Relatorio; periodo: Periodo }) {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Período do relatório" className="flex flex-col gap-2">
        <ul className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => {
            const atual = p.valor === periodo;
            return (
              <li key={p.valor}>
                <Link
                  href={`/app/relatorio?periodo=${p.valor}`}
                  aria-current={atual ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-lg border px-4 py-2 font-bold transition-colors ${
                    atual ? 'border-caneta bg-caneta text-na-caneta' : 'border-linha bg-folha text-tinta hover:border-tinta-suave'
                  }`}
                >
                  {p.rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-tinta-suave">
          De {dataPorExtenso(r.intervalo.inicio, FORMATO_DATA)} a {dataPorExtenso(r.intervalo.fim, FORMATO_DATA)}.
        </p>
      </nav>

      <section aria-label="Resumo do período">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero rotulo="Horas" valor={formatarMinutos(r.minutos)} nota={variacao(r.minutos, r.anterior.minutos, horasZero)} />
          <Numero rotulo="Questões" valor={String(r.questoes)} nota={variacao(r.questoes, r.anterior.questoes, String)} />
          <Numero
            rotulo="Acerto"
            valor={r.percentualAcerto === null ? '—' : `${r.percentualAcerto}%`}
            nota={variacaoAcerto(r.percentualAcerto, r.anterior.percentualAcerto)}
          />
          <Numero rotulo="Dias com estudo" valor={String(r.diasComEstudo)} />
        </dl>
      </section>

      <section aria-labelledby="rel-materias" className={cartao}>
        <h2 id="rel-materias" className={titulo}>
          Por matéria
        </h2>
        <p className="text-sm text-tinta-suave">Parte do tempo estudado e parte do tempo planejado em cada matéria.</p>
        <ul className="flex flex-col gap-5">
          {r.porDisciplina.map((d) => (
            <li key={d.disciplinaId} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 font-bold leading-snug">{d.nome}</span>
                <span className="shrink-0 text-sm text-tinta-suave">{formatarMinutos(d.minutos)}</span>
              </div>
              <Barra rotulo="Estudado" fracao={d.fracaoEstudada} cheia />
              <Barra rotulo="Planejado" fracao={d.fracaoPlanejada} cheia={false} />
              {d.diasSemEstudo !== null && d.diasSemEstudo >= DIAS_SEM_ESTUDO_AVISO && (
                <p className="text-sm font-bold text-erro">sem estudo há {d.diasSemEstudo} dias</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rel-reforcar" className={cartao}>
        <h2 id="rel-reforcar" className={titulo}>
          Assuntos para reforçar
        </h2>
        {r.reforcar.length === 0 ? (
          <p className="text-tinta-suave">Sem assuntos com pelo menos 5 questões e acerto abaixo de 70% neste período.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {r.reforcar.map((t) => (
              <li key={t.topicoId} className="flex flex-col gap-0.5">
                <span className="font-bold leading-snug">{t.topicoNome}</span>
                <span className="text-sm text-tinta-suave">
                  {t.disciplinaNome} · {t.percentual}% de acerto em {t.questoes} questões
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="rel-revisoes" className={cartao}>
        <h2 id="rel-revisoes" className={titulo}>
          Revisões da semana
        </h2>
        <dl className="grid grid-cols-3 gap-3">
          <Numero rotulo="Agendadas" valor={String(r.revisoes.agendadas)} />
          <Numero rotulo="Concluídas" valor={String(r.revisoes.concluidas)} />
          <Numero rotulo="Atrasadas" valor={String(r.revisoes.atrasadas)} />
        </dl>
      </section>

      {r.orientacoes.length > 0 && (
        <section aria-labelledby="rel-orientacoes" className={cartao}>
          <h2 id="rel-orientacoes" className={titulo}>
            Orientações
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {r.orientacoes.map((o) => (
              <li key={o.tipo}>{textoOrientacao(o)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
