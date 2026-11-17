'use client';

import { useId, useState } from 'react';
import { agruparAgenda } from '@/lib/acompanhamento/revisoes';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { Confirmacao } from '../Dialogo';
import { alerta } from '../estilos';
import { ItemRevisao } from './ItemRevisao';
import { useRevisoes } from './useRevisoes';

/** Agrupa por matéria, mantendo a ordem em que as matérias aparecem. */
function porMateria(revisoes: Revisao[]): [string, Revisao[]][] {
  const mapa = new Map<string, Revisao[]>();
  for (const r of revisoes) mapa.set(r.disciplinaNome, [...(mapa.get(r.disciplinaNome) ?? []), r]);
  return [...mapa];
}

/** Agenda de revisões: atrasadas, hoje, esta semana, próximas e concluídas. */
export function Agenda({ revisoes: iniciais, hoje }: { revisoes: Revisao[]; hoje: string }) {
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
    <div className="flex flex-col gap-8">
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-folha px-5 py-6">
          Nenhuma revisão agendada. Elas aparecem quando você registra estudo de um tópico.
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.chave} aria-labelledby={`${id}-${g.chave}`} className="flex flex-col gap-3">
            <h2 id={`${id}-${g.chave}`} className="text-2xl font-bold tracking-tight">
              {g.titulo} ({g.itens.length})
            </h2>
            {porMateria(g.itens).map(([materia, itens]) => (
              <div key={materia} className="flex flex-col gap-1">
                <h3 className="text-sm font-bold text-caneta">{materia}</h3>
                <ul className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
                  {itens.map((r) => (
                    <ItemRevisao key={r.id} revisao={r} hoje={hoje} aoConcluir={concluir} aoExcluir={setAExcluir} />
                  ))}
                </ul>
              </div>
            ))}
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
