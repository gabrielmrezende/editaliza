'use client';

import Link from 'next/link';
import { useId } from 'react';
import { dataPorExtenso } from '@/lib/datas';
import type { BlocoEstudo, Topico } from '@/lib/dominio/tipos';
import { Bolha } from './Bolha';
import { formatarMinutos } from '@/lib/formatar';
import { botaoSecundario, botaoTexto } from '../estilos';

export type ItemHoje = {
  chave: string;
  tipo: BlocoEstudo['tipo'];
  disciplinaId: string;
  disciplina: string;
  topico: Topico | null;
  minutos: number;
  concluido: boolean;
  /** Sessão de "Estudei" que cobre este bloco (null = ainda não registrado). */
  sessaoRapidaId: string | null;
  /** Gravando ou desfazendo o "Estudei" deste bloco. */
  registrando: boolean;
};

/** Link de "Iniciar": abre Estudar com a matéria/tópico escolhidos e o cronômetro rodando. */
const linkIniciar = (disciplinaId: string, topicoId: string) =>
  `/app/estudar?disciplina=${encodeURIComponent(disciplinaId)}&topico=${encodeURIComponent(topicoId)}&iniciar=1`;

const TITULO_TIPO: Record<BlocoEstudo['tipo'], string | null> = {
  estudo: null,
  revisao_geral: 'Revisão geral',
  simulado: 'Simulado',
};

/** Blocos de hoje: "Iniciar" (cronômetro), "Estudei" (registro rápido) e a bolha "concluí este tópico". */
export function Hoje({
  data,
  itens,
  semTempo,
  aoMarcar,
  aoEstudar,
  aoDesfazer,
}: {
  data: string;
  itens: ItemHoje[];
  semTempo: boolean;
  aoMarcar: (topicoId: string, nome: string, feito: boolean) => void;
  aoEstudar: (item: ItemHoje) => void;
  aoDesfazer: (item: ItemHoje) => void;
}) {
  const id = useId();
  const total = itens.reduce((s, i) => s + i.minutos, 0);

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-2xl font-bold tracking-tight">
          Hoje
        </h2>
        <p className="text-tinta-suave">
          <span className="inline-block first-letter:uppercase">{dataPorExtenso(data, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {total > 0 && `, ${formatarMinutos(total)} de estudo`}
        </p>
      </div>

      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-folha px-5 py-6">
          <strong>Dia livre.</strong>{' '}
          {semTempo
            ? 'Você não marcou horas de estudo na semana. Crie um novo plano com seus horários.'
            : 'Não há estudo marcado para hoje. Descanse ou adiante uma revisão.'}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
          {itens.map((item) => {
            const idTopico = `${id}-${item.chave}`;
            const titulo = TITULO_TIPO[item.tipo];
            return (
              <li key={item.chave} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-bold text-caneta">{item.disciplina}</p>
                  <p id={idTopico} className={`text-lg font-bold leading-snug ${item.concluido ? 'text-tinta-suave line-through decoration-2' : ''}`}>
                    {titulo ?? item.topico?.nome ?? 'Todos os tópicos concluídos: revise a matéria'}
                  </p>
                  <p className="text-sm text-tinta-suave">{formatarMinutos(item.minutos)}</p>
                </div>
                {item.tipo === 'estudo' && item.topico && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:shrink-0 sm:justify-end">
                    <Link
                      href={linkIniciar(item.disciplinaId, item.topico.id)}
                      className={botaoSecundario}
                      aria-describedby={idTopico}
                    >
                      Iniciar
                    </Link>
                    {item.sessaoRapidaId ? (
                      <p className="flex items-center gap-1 text-sm font-bold text-caneta">
                        Registrado
                        <span aria-hidden>·</span>
                        <button
                          type="button"
                          className={botaoTexto}
                          aria-describedby={idTopico}
                          disabled={item.registrando}
                          onClick={() => aoDesfazer(item)}
                        >
                          Desfazer
                        </button>
                      </p>
                    ) : (
                      <button
                        type="button"
                        className={botaoSecundario}
                        aria-describedby={idTopico}
                        disabled={item.registrando}
                        onClick={() => aoEstudar(item)}
                      >
                        {item.registrando ? 'Registrando…' : 'Estudei'}
                      </button>
                    )}
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm font-bold">
                      <Bolha
                        checked={item.concluido}
                        aria-describedby={idTopico}
                        onChange={(e) => aoMarcar(item.topico!.id, item.topico!.nome, e.target.checked)}
                      />
                      Concluí este tópico
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
