'use client';

import { useId, type ReactNode } from 'react';
import { estiloMateria } from '@/components/cores';
import { alerta, listaLinhas } from '@/components/estilos';
import { ROTULO_TIPO } from '@/components/estudo/FormularioSessao';
import { ItemRevisao } from '@/components/revisoes/ItemRevisao';
import { dataPorExtenso } from '@/lib/datas';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';
import type { DiaCalendario } from '@/lib/plano/calendario';
import type { Fila } from '@/lib/plano/fila';
import { tituloDoBloco } from './CartaoProximoBloco';


function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h4 id={id} className="text-sm text-texto-suave">
        {titulo}
      </h4>
      {children}
    </section>
  );
}

/** Linha "● Matéria · resto · minutos", na cor da matéria. */
function Linha({ indice, partes, minutos }: { indice: number | undefined; partes: string[]; minutos: number }) {
  return (
    <li className="flex items-start gap-2 px-3 py-2.5" style={indice !== undefined ? estiloMateria(indice) : undefined}>
      {indice !== undefined && <span aria-hidden className="bolinha mt-2 shrink-0" />}
      <span className="min-w-0 flex-1 leading-snug break-words">{partes.join(' · ')}</span>
      <span className="shrink-0 tabular-nums text-texto-suave">{formatarMinutos(minutos)}</span>
    </li>
  );
}

/** Detalhe do dia escolhido no calendário: o estudo feito, as revisões (com concluir) e os blocos previstos. */
export function DetalheDia({
  dia,
  hoje,
  fila,
  sessoes,
  revisoes,
  disciplinas,
  indices,
  erroRevisao,
  aoConcluirRevisao,
}: {
  dia: DiaCalendario | null;
  hoje: string;
  fila: Fila;
  sessoes: Sessao[];
  revisoes: Revisao[];
  disciplinas: DisciplinaPlano[];
  indices: Map<string, number>;
  erroRevisao: string | null;
  aoConcluirRevisao: (id: string, concluida: boolean) => void;
}) {
  if (!dia) return <div aria-live="polite" />;
  const porId = new Map(disciplinas.map((d) => [d.id, d]));
  const estudo = dia.data > hoje ? [] : sessoes.filter((s) => s.data === dia.data);
  const doDia = revisoes.filter((r) => r.dataRevisao === dia.data);
  const titulo = dataPorExtenso(dia.data, { weekday: 'long', day: 'numeric', month: 'long' });
  const vazio = estudo.length === 0 && doDia.length === 0 && dia.previstos.length === 0;

  return (
    <div aria-live="polite" className="flex flex-col gap-4 rounded-cartao border border-borda bg-superficie p-4 shadow-cartao sm:p-5">
      <h3 className="text-lg font-semibold tracking-tight first-letter:uppercase">{titulo}</h3>
      {vazio && <p className="text-texto-suave">Nada neste dia.</p>}

      {estudo.length > 0 && (
        <Secao titulo="Estudo">
          <ul className="flex flex-col divide-y divide-borda rounded-linha border border-borda">
            {estudo.map((s) => (
              <Linha
                key={s.id}
                indice={indices.get(s.disciplinaId)}
                partes={[
                  s.disciplinaNome,
                  ...(s.topicoNome ? [s.topicoNome] : s.tipo ? [ROTULO_TIPO[s.tipo]] : []),
                ]}
                minutos={s.minutos}
              />
            ))}
          </ul>
        </Secao>
      )}

      {doDia.length > 0 && (
        <Secao titulo="Revisões">
          {erroRevisao && (
            <p role="alert" className={alerta}>
              {erroRevisao}
            </p>
          )}
          <ul className={listaLinhas}>
            {doDia.map((r) => (
              <ItemRevisao
                key={r.id}
                revisao={r}
                hoje={hoje}
                indiceMateria={indices.get(r.disciplinaId)}
                mostrarMateria
                aoConcluir={aoConcluirRevisao}
              />
            ))}
          </ul>
        </Secao>
      )}

      {dia.previstos.length > 0 && (
        <Secao titulo="Previsto">
          <ul className="flex flex-col divide-y divide-borda rounded-linha border border-dashed border-borda-forte">
            {dia.previstos.map((b) => {
              const disciplina = porId.get(b.disciplinaId);
              const nome = disciplina?.nome ?? 'Matéria';
              const partes =
                fila.modo === 'prazo' ? [nome, tituloDoBloco(b, disciplina, b.topicoId, nome)] : [nome];
              return <Linha key={b.posicao} indice={indices.get(b.disciplinaId)} partes={partes} minutos={b.minutos} />;
            })}
          </ul>
        </Secao>
      )}
    </div>
  );
}
