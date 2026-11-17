import { useId } from 'react';
import { dataPorExtenso } from '@/lib/datas';
import type { DiaPlano, DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';
import { estiloMateria } from '../cores';

type ItemCiclo = { disciplinaId: string; minutos: number };

const ROTULO_TIPO = { revisao_geral: 'Revisão geral', simulado: 'Simulado' } as const;

/**
 * Os próximos 7 dias numa faixa (no celular, em linhas); sem data de prova, os dias seguem o
 * ciclo e a ordem dele aparece abaixo.
 */
export function Semana({
  hoje,
  dias,
  ciclo,
  nomes,
  indices,
}: {
  hoje: string;
  dias: DiaPlano[];
  ciclo: ItemCiclo[] | null;
  nomes: Map<string, DisciplinaPlano>;
  indices: Map<string, number>;
}) {
  const id = useId();
  const nome = (disciplinaId: string) => nomes.get(disciplinaId)?.nome ?? 'Matéria';

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
      <h2 id={`${id}-titulo`} className="text-xl font-extrabold tracking-tight">
        Semana
      </h2>
      {ciclo && ciclo.length === 0 ? (
        <p className="text-texto-suave">Sem horas de estudo na semana, o ciclo fica vazio.</p>
      ) : (
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {dias.map((dia) => {
            const total = dia.blocos.reduce((s, b) => s + b.minutos, 0);
            const ehHoje = dia.data === hoje;
            // Junta blocos da mesma matéria/tipo no resumo do dia.
            const resumo = new Map<string, { minutos: number; indice: number }>();
            for (const b of dia.blocos) {
              const chave = b.tipo === 'estudo' ? nome(b.disciplinaId) : ROTULO_TIPO[b.tipo];
              const indice = b.tipo === 'estudo' ? (indices.get(b.disciplinaId) ?? -1) : -1;
              const atual = resumo.get(chave);
              resumo.set(chave, { minutos: (atual?.minutos ?? 0) + b.minutos, indice });
            }
            return (
              <li
                key={dia.data}
                aria-current={ehHoje ? 'date' : undefined}
                className={`flex min-w-0 items-start gap-3 overflow-hidden rounded-linha border px-3 py-2.5 sm:flex-col sm:gap-2 sm:px-2.5 sm:py-3 ${
                  ehHoje ? 'border-acao bg-suave shadow-[inset_0_0_0_1px_var(--acao)]' : 'border-borda bg-superficie'
                }`}
              >
                <div className="w-12 shrink-0 sm:w-auto">
                  <p className={`text-sm font-extrabold capitalize ${ehHoje ? 'text-texto' : 'text-texto-medio'}`}>
                    {dataPorExtenso(dia.data, { weekday: 'short' }).replace('.', '')}
                  </p>
                  <p className="text-xs text-texto-suave">{dataPorExtenso(dia.data, { day: 'numeric', month: 'numeric' })}</p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:w-full">
                  {total === 0 ? (
                    <p className="text-sm text-texto-suave">Livre</p>
                  ) : (
                    <>
                      {/* Barra do dia: um trecho por matéria, proporcional ao tempo. */}
                      <div aria-hidden className="flex h-1.5 w-full gap-px overflow-hidden rounded-full">
                        {[...resumo].map(([texto, r]) => (
                          <span
                            key={texto}
                            className="h-full bg-[var(--cor-materia,var(--borda-forte))] shadow-[inset_0_0_0_1px_var(--anel-bolinha)]"
                            style={{ ...(r.indice >= 0 ? estiloMateria(r.indice) : {}), flexGrow: r.minutos }}
                          />
                        ))}
                      </div>
                      <ul className="flex w-full min-w-0 flex-wrap gap-x-3 gap-y-0.5 sm:flex-col sm:flex-nowrap">
                        {[...resumo].map(([texto, r]) => (
                          <li key={texto} className="flex min-w-0 items-center gap-1.5 text-xs sm:text-[0.6875rem]" style={r.indice >= 0 ? estiloMateria(r.indice) : undefined}>
                            <span aria-hidden className="bolinha size-2" />
                            <span className="min-w-0 truncate font-semibold text-texto-medio" title={texto}>
                              {texto}
                            </span>
                            <span className="shrink-0 text-texto-suave sm:hidden">{formatarMinutos(r.minutos)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                {total > 0 && (
                  <p className="shrink-0 text-sm font-extrabold sm:mt-auto sm:pt-1">{formatarMinutos(total)}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {ciclo && ciclo.length > 0 && <Ciclo ciclo={ciclo} nome={nome} indices={indices} />}
    </section>
  );
}

function Ciclo({
  ciclo,
  nome,
  indices,
}: {
  ciclo: ItemCiclo[];
  nome: (id: string) => string;
  indices: Map<string, number>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-texto-suave">
        As matérias seguem esta ordem, no tempo que você tem a cada dia: quando o tempo de uma acaba, começa a
        próxima; ao fim, o ciclo recomeça.
      </p>
      <ol className="flex flex-col divide-y divide-borda rounded-cartao border border-borda bg-superficie shadow-cartao">
        {ciclo.map((item, i) => (
          <li
            key={`${item.disciplinaId}-${i}`}
            className="flex items-center gap-3 px-4 py-2.5"
            style={estiloMateria(indices.get(item.disciplinaId) ?? i)}
          >
            <span className="w-5 shrink-0 text-right text-xs font-bold text-texto-suave">{i + 1}</span>
            <span aria-hidden className="bolinha" />
            <span className="min-w-0 flex-1 text-sm font-semibold">{nome(item.disciplinaId)}</span>
            <span className="shrink-0 text-sm text-texto-suave">{formatarMinutos(item.minutos)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
