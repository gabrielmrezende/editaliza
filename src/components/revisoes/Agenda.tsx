'use client';

import { useId, useState } from 'react';
import { agruparAgenda } from '@/lib/acompanhamento/revisoes';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { Confirmacao } from '../Dialogo';
import { estiloMateria } from '../cores';
import { alerta, listaLinhas, vazio } from '../estilos';
import { ItemRevisao } from './ItemRevisao';
import { useRevisoes } from './useRevisoes';

/** Agrupa por matéria, mantendo a ordem em que as matérias aparecem. */
function porMateria(revisoes: Revisao[]): [string, Revisao[]][] {
  const mapa = new Map<string, Revisao[]>();
  for (const r of revisoes) mapa.set(r.disciplinaNome, [...(mapa.get(r.disciplinaNome) ?? []), r]);
  return [...mapa];
}

/** Agenda de revisões: atrasadas, hoje, esta semana, próximas e concluídas. */
export function Agenda({
  revisoes: iniciais,
  hoje,
  indices,
}: {
  revisoes: Revisao[];
  hoje: string;
  /** Matéria do plano ativo → posição (cor da bolinha). */
  indices: Map<string, number>;
}) {
  const id = useId();
  const { revisoes, concluir, excluir, erro, anuncio } = useRevisoes(iniciais);
  const [aExcluir, setAExcluir] = useState<Revisao | null>(null);
  const agenda = agruparAgenda(revisoes, hoje);
  const grupos = [
    { chave: 'atrasadas', titulo: 'Atrasadas', itens: agenda.atrasadas },
    { chave: 'hoje', titulo: 'Hoje', itens: agenda.hoje },
    { chave: 'semana', titulo: 'Esta semana', itens: agenda.semana },
    { chave: 'proximas', titulo: 'Próximas', itens: agenda.proximas },
    { chave: 'concluidas', titulo: 'Concluídas', itens: agenda.concluidas },
  ].filter((g) => g.itens.length > 0);

  return (
    <div className="flex max-w-3xl flex-col gap-9">
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {grupos.length === 0 ? (
        <p className={vazio}>
          Nenhuma revisão agendada. Elas aparecem quando você registra estudo de um tópico.
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.chave} aria-labelledby={`${id}-${g.chave}`} className="flex flex-col gap-4">
            <h2 id={`${id}-${g.chave}`} className="flex items-baseline gap-2.5 text-xl font-extrabold tracking-tight">
              {g.titulo}
              <span
                aria-hidden
                className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${
                  g.chave === 'atrasadas' ? 'bg-rust-claro text-rust-texto' : 'bg-suave text-texto-medio'
                }`}
              >
                {g.itens.length}
              </span>
              <span className="sr-only"> ({g.itens.length})</span>
            </h2>
            {porMateria(g.itens).map(([materia, itens]) => {
              const indice = indices.get(itens[0].disciplinaId);
              return (
                <div key={materia} className="flex flex-col gap-2" style={indice !== undefined ? estiloMateria(indice) : undefined}>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-texto-medio">
                    <span aria-hidden className="bolinha" />
                    {materia}
                  </h3>
                  <ul className={listaLinhas}>
                    {itens.map((r) => (
                      <ItemRevisao
                        key={r.id}
                        revisao={r}
                        hoje={hoje}
                        indiceMateria={indice}
                        aoConcluir={concluir}
                        aoExcluir={setAExcluir}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </section>
        ))
      )}

      <Confirmacao
        aberto={aExcluir !== null}
        titulo="Excluir a revisão?"
        confirmar="Excluir"
        cancelar="Cancelar"
        aoConfirmar={() => {
          if (aExcluir) excluir(aExcluir.id);
          setAExcluir(null);
        }}
        aoCancelar={() => setAExcluir(null)}
      >
        {aExcluir ? `A revisão de ${aExcluir.topicoNome} (${aExcluir.disciplinaNome}) sai da agenda.` : ''}
      </Confirmacao>
    </div>
  );
}
