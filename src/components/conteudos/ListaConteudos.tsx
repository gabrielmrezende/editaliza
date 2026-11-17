'use client';

import { useId } from 'react';
import type { Aviso, DisciplinaPlano } from '@/lib/dominio/tipos';
import { progresso } from '@/lib/plano/consultas';
import { Avisos } from '../plano/Avisos';
import { Bolha } from '../plano/Bolha';
import { useMarcacoes } from '../plano/useMarcacoes';
import { estiloMateria } from '../cores';
import { alerta, cartao } from '../estilos';

const pct = (feitos: number, total: number) => (total === 0 ? 0 : Math.round((feitos / total) * 100));
const textoTopicos = (feitos: number, total: number) => `${feitos} de ${total} ${total === 1 ? 'tópico' : 'tópicos'}`;

/** Edital verticalizado: avisos do plano, % geral e, por matéria, a barra e os tópicos para marcar. */
export function ListaConteudos({
  planoId,
  disciplinas,
  avisos,
  concluidos: iniciais,
}: {
  planoId: string;
  disciplinas: DisciplinaPlano[];
  avisos: Aviso[];
  concluidos: string[];
}) {
  const id = useId();
  const { concluidos, marcar, erro, anuncio } = useMarcacoes(planoId, iniciais);
  const p = progresso(disciplinas, [...concluidos]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Avisos avisos={avisos} disciplinas={disciplinas} />

      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      <p className="text-texto-suave">
        <span className="font-semibold text-texto tabular-nums">{pct(p.concluidos, p.total)}%</span> do edital ·{' '}
        <span className="tabular-nums">{textoTopicos(p.concluidos, p.total)}</span>
      </p>

      {disciplinas.map((d, i) => {
        const { total, concluidos: feitos } = p.porDisciplina[d.id];
        return (
          <section key={d.id} aria-labelledby={`${id}-${d.id}`} className="flex flex-col gap-3" style={estiloMateria(i)}>
            <h2 id={`${id}-${d.id}`} className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
              <span aria-hidden className="bolinha" />
              {d.nome}
            </h2>
            <div className="flex flex-col gap-2">
              <p className="text-texto-suave tabular-nums">{textoTopicos(feitos, total)}</p>
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-borda">
                <div className="barra h-full rounded-full bg-[var(--cor-materia)]" style={{ width: `${pct(feitos, total)}%` }} />
              </div>
            </div>
            <ul className={`${cartao} flex flex-col divide-y divide-borda`}>
              {d.topicos.map((t) => (
                <li key={t.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5">
                    <Bolha checked={concluidos.has(t.id)} onChange={(e) => marcar(t.id, t.nome, e.target.checked)} />
                    <span className="min-w-0 flex-1 break-words leading-snug">{t.nome}</span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
