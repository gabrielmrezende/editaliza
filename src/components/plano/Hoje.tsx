'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type CSSProperties } from 'react';
import { Clock, FileCheck2, Play, Repeat2, Undo2 } from 'lucide-react';
import { dataPorExtenso } from '@/lib/datas';
import type { BlocoEstudo, Topico } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';
import { CheckAnimado } from '../CheckAnimado';
import { estiloMateria } from '../cores';
import { botaoSecundario, vazio } from '../estilos';
import { Bolha } from './Bolha';

export type ItemHoje = {
  chave: string;
  tipo: BlocoEstudo['tipo'];
  disciplinaId: string;
  disciplina: string;
  /** Posição da matéria no plano (cor da bolinha); -1 se não houver. */
  indiceMateria: number;
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

const passo = (n: number) => ({ '--passo': n }) as CSSProperties;

type Acoes = {
  aoMarcar: (topicoId: string, nome: string, feito: boolean) => void;
  aoEstudar: (item: ItemHoje) => void;
  aoDesfazer: (item: ItemHoje) => void;
};

/**
 * Blocos de hoje, na ordem do dia. O primeiro bloco ainda não registrado nem concluído é o
 * destaque "Agora" (cartão navy); os demais são linhas compactas. Cada bloco tem "Iniciar"
 * (cronômetro), "Estudei" (registro rápido) e a bolha "concluí este tópico".
 */
export function Hoje({
  data,
  itens,
  semTempo,
  ...acoes
}: {
  data: string;
  itens: ItemHoje[];
  semTempo: boolean;
} & Acoes) {
  const id = useId();
  const total = itens.reduce((s, i) => s + i.minutos, 0);
  const alvo = itens.findIndex((i) => i.tipo === 'estudo' && i.topico && !i.concluido && !i.sessaoRapidaId);
  // O destaque só passa para o próximo bloco depois de um instante: dá tempo de ver a bolha encher
  // e o layout não salta sob o dedo em cliques seguidos.
  const [agora, setAgora] = useState(alvo);
  useEffect(() => {
    if (alvo === agora) return;
    const t = window.setTimeout(() => setAgora(alvo), 700);
    return () => window.clearTimeout(t);
  }, [alvo, agora]);
  const temEstudo = itens.some((i) => i.tipo === 'estudo' && i.topico);
  // Entrada orquestrada do "Agora" só ao abrir o plano; depois o destaque só troca de bloco.
  const [entrou, setEntrou] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setEntrou(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-2xl font-extrabold tracking-tight">
          Hoje
        </h2>
        <p className="text-sm font-medium text-texto-suave">
          <span className="inline-block first-letter:uppercase">{dataPorExtenso(data, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {total > 0 && `, ${formatarMinutos(total)} de estudo`}
        </p>
      </div>

      {itens.length === 0 ? (
        <p className={vazio}>
          <strong className="text-texto">Dia livre.</strong>{' '}
          {semTempo
            ? 'Você não marcou horas de estudo na semana. Crie um novo plano com seus horários.'
            : 'Não há estudo marcado para hoje. Descanse ou adiante uma revisão.'}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {itens.map((item, i) => (
            <Bloco
              key={item.chave}
              item={item}
              idTopico={`${id}-${item.chave}`}
              destaque={i === agora}
              entrada={i === agora && !entrou}
              {...acoes}
            />
          ))}
        </ol>
      )}
      {temEstudo && alvo < 0 && (
        <p className="flex items-center gap-2 text-sm font-bold text-ok">
          <CheckAnimado />
          Tudo de hoje está feito.
        </p>
      )}
    </section>
  );
}

const MINT =
  'inline-flex min-h-12 items-center gap-2 rounded-linha bg-mint px-6 font-extrabold text-na-mint transition-colors hover:bg-mint-forte';
const CONTORNO_NAVY =
  'inline-flex min-h-12 items-center gap-2 rounded-linha border border-white/25 px-5 text-sm font-bold text-na-navy transition-colors hover:border-white/50 hover:bg-white/8 disabled:opacity-60';

/**
 * Um bloco de hoje. `destaque` = o cartão navy "Agora" (o que estudar agora); senão, linha
 * compacta. Os dois modos têm a mesma árvore (a bolha é o mesmo elemento): quando o destaque
 * passa para o próximo bloco, nada é remontado e o clique na bolha não se perde.
 */
function Bloco({
  item,
  idTopico,
  destaque,
  entrada,
  aoMarcar,
  aoEstudar,
  aoDesfazer,
}: { item: ItemHoje; idTopico: string; destaque: boolean; entrada: boolean } & Acoes) {
  const topico = item.tipo === 'estudo' ? item.topico : null;
  const feito = item.concluido || item.sessaoRapidaId !== null;
  const IconeTipo = item.tipo === 'simulado' ? FileCheck2 : Repeat2;

  return (
    <li
      className={
        destaque
          ? `sobre-navy relative isolate flex flex-wrap items-center gap-x-3 gap-y-3 overflow-hidden rounded-destaque bg-navy py-5 pl-6 pr-5 text-na-navy shadow-destaque sm:py-7 sm:pl-8 sm:pr-7 ${
              entrada ? 'agora-entrada' : ''
            }`
          : `flex flex-wrap items-center gap-x-3 gap-y-2 rounded-linha border border-borda px-2 py-2 sm:pr-3 ${
              feito ? 'bg-superficie-alt' : 'bg-superficie shadow-cartao'
            }`
      }
      style={item.indiceMateria >= 0 ? estiloMateria(item.indiceMateria) : undefined}
    >
      {/* Faixa da cor da matéria: liga o destaque à bolinha do menu. */}
      {destaque && <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[var(--cor-materia,var(--mint))]" />}
      {destaque && (
        <span className="w-full">
          <span
            data-passo
            style={passo(0)}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-mint"
          >
            <span aria-hidden className="size-2 rounded-full bg-mint" />
            Agora
          </span>
        </span>
      )}

      {topico ? (
        <label
          data-passo={destaque || undefined}
          style={destaque ? passo(4) : undefined}
          className={
            destaque
              ? 'order-last flex min-h-12 cursor-pointer items-center gap-2.5 rounded-linha px-1 text-sm font-semibold text-na-navy-suave hover:text-na-navy sm:ml-auto'
              : 'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full'
          }
        >
          <Bolha
            checked={item.concluido}
            aria-describedby={idTopico}
            onChange={(e) => aoMarcar(topico.id, topico.nome, e.target.checked)}
          />
          <span className={destaque ? undefined : 'sr-only'}>Concluí este tópico</span>
        </label>
      ) : (
        <span aria-hidden className="grid size-11 shrink-0 place-items-center text-texto-suave">
          <IconeTipo className="size-5" />
        </span>
      )}

      <div className={destaque ? 'flex w-full flex-col gap-1.5 pb-3 pt-1' : 'flex min-w-0 flex-1 basis-48 flex-col py-0.5'}>
        <p
          data-passo={destaque || undefined}
          style={destaque ? passo(1) : undefined}
          className={`flex flex-wrap items-center gap-x-2 font-semibold ${
            destaque ? 'text-sm text-na-navy-suave' : 'text-xs text-texto-suave'
          }`}
        >
          {item.indiceMateria >= 0 && <span aria-hidden className="bolinha" />}
          {item.disciplina}
          {!destaque && <span className="font-medium">{formatarMinutos(item.minutos)}</span>}
        </p>
        <p
          data-passo={destaque || undefined}
          style={destaque ? passo(2) : undefined}
          id={idTopico}
          className={
            destaque
              ? 'max-w-[36ch] text-2xl font-extrabold leading-tight tracking-tight text-balance break-words sm:text-[1.75rem]'
              : `font-bold leading-snug break-words ${item.concluido ? 'text-texto-suave line-through decoration-2' : 'text-texto'}`
          }
        >
          {TITULO_TIPO[item.tipo] ?? item.topico?.nome ?? 'Todos os tópicos concluídos: revise a matéria'}
        </p>
        {destaque && (
          <p data-passo style={passo(3)} className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-na-navy-suave">
            <Clock aria-hidden className="size-4" />
            {formatarMinutos(item.minutos)}
          </p>
        )}
      </div>

      {topico && (
        <div
          data-passo={destaque || undefined}
          style={destaque ? passo(4) : undefined}
          className={
            destaque ? 'flex flex-wrap items-center gap-3' : 'flex flex-wrap items-center gap-2 max-sm:w-full max-sm:pl-14'
          }
        >
          {item.sessaoRapidaId ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ok">
                <CheckAnimado />
                Registrado
              </span>
              <button
                type="button"
                aria-describedby={idTopico}
                disabled={item.registrando}
                onClick={() => aoDesfazer(item)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-linha px-2.5 text-sm font-bold text-link hover:underline disabled:opacity-60"
              >
                <Undo2 aria-hidden className="size-4" />
                Desfazer
              </button>
            </>
          ) : (
            <>
              <Link
                href={linkIniciar(item.disciplinaId, topico.id)}
                aria-describedby={idTopico}
                className={destaque ? MINT : `${botaoSecundario} px-3.5`}
              >
                <Play aria-hidden className={`${destaque ? 'size-4' : 'size-3.5'} fill-current`} />
                Iniciar
              </Link>
              <button
                type="button"
                aria-describedby={idTopico}
                disabled={item.registrando}
                onClick={() => aoEstudar(item)}
                className={destaque ? CONTORNO_NAVY : `${botaoSecundario} px-3.5`}
              >
                {item.registrando ? 'Registrando…' : 'Estudei'}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
