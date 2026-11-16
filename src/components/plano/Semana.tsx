import { useId } from 'react';
import { dataPorExtenso } from '@/lib/datas';
import type { DiaPlano, DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from './formatar';

type ItemCiclo = { disciplinaId: string; minutos: number };

const ROTULO_TIPO = { revisao_geral: 'Revisão geral', simulado: 'Simulado' } as const;

/** Os próximos 7 dias (modo prazo) ou a ordem do ciclo (sem data de prova). */
export function Semana({
  hoje,
  dias,
  ciclo,
  posicaoCiclo,
  diaDeEstudo,
  nomes,
}: {
  hoje: string;
  dias: DiaPlano[];
  ciclo: ItemCiclo[] | null;
  posicaoCiclo: number;
  diaDeEstudo: boolean;
  nomes: Map<string, DisciplinaPlano>;
}) {
  const id = useId();
  const nome = (disciplinaId: string) => nomes.get(disciplinaId)?.nome ?? 'Matéria';

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
      <h2 id={`${id}-titulo`} className="text-2xl font-bold tracking-tight">
        Semana
      </h2>
      {ciclo ? <Ciclo ciclo={ciclo} atual={ciclo.length ? posicaoCiclo % ciclo.length : -1} marca={diaDeEstudo ? 'hoje' : 'próximo'} nome={nome} /> : (
        <ol className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
          {dias.map((dia) => {
            const total = dia.blocos.reduce((s, b) => s + b.minutos, 0);
            const ehHoje = dia.data === hoje;
            // Junta blocos da mesma matéria/tipo no resumo do dia.
            const resumo = new Map<string, number>();
            for (const b of dia.blocos) {
              const chave = b.tipo === 'estudo' ? nome(b.disciplinaId) : ROTULO_TIPO[b.tipo];
              resumo.set(chave, (resumo.get(chave) ?? 0) + b.minutos);
            }
            return (
              <li key={dia.data} aria-current={ehHoje ? 'date' : undefined} className="flex gap-4 px-4 py-3">
                <div className="w-14 shrink-0">
                  <p className={`inline-block rounded px-1 text-sm font-bold capitalize ${ehHoje ? 'bg-marca' : ''}`}>
                    {dataPorExtenso(dia.data, { weekday: 'short' }).replace('.', '')}
                  </p>
                  <p className="px-1 text-sm text-tinta-suave">{dataPorExtenso(dia.data, { day: 'numeric', month: 'numeric' })}</p>
                </div>
                <div className="min-w-0 flex-1">
                  {total === 0 ? (
                    <p className="text-tinta-suave">Livre</p>
                  ) : (
                    <>
                      <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {[...resumo].map(([texto, minutos]) => (
                          <li key={texto}>
                            {texto} <span className="text-tinta-suave">{formatarMinutos(minutos)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                {total > 0 && <p className="shrink-0 text-sm font-bold">{formatarMinutos(total)}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Ciclo({ ciclo, atual, marca, nome }: { ciclo: ItemCiclo[]; atual: number; marca: string; nome: (id: string) => string }) {
  if (ciclo.length === 0) {
    return <p className="text-tinta-suave">Sem horas de estudo na semana, o ciclo fica vazio.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-tinta-suave">Uma matéria por dia de estudo, nesta ordem; ao fim, o ciclo recomeça.</p>
      <ol className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
        {ciclo.map((item, i) => (
          <li key={`${item.disciplinaId}-${i}`} aria-current={i === atual ? 'step' : undefined} className="flex items-center gap-4 px-4 py-3">
            <span className="w-6 shrink-0 text-right text-sm text-tinta-suave">{i + 1}</span>
            <span className={`min-w-0 flex-1 ${i === atual ? 'font-bold' : ''}`}>
              {nome(item.disciplinaId)}
              {i === atual && <span className="ml-2 rounded bg-marca px-1.5 text-sm">{marca}</span>}
            </span>
            <span className="shrink-0 text-sm text-tinta-suave">{formatarMinutos(item.minutos)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
