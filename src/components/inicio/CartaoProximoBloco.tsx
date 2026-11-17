'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Pause, Play, Undo2 } from 'lucide-react';
import { CheckAnimado } from '@/components/CheckAnimado';
import { estiloMateria } from '@/components/cores';
import { botaoContornoNavy, botaoMint, botaoTextoNavy } from '@/components/estilos';
import { FORMULARIO_VAZIO, formatarRelogio, useCronometro } from '@/components/estudo/useCronometro';
import { Bolha } from '@/components/plano/Bolha';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';
import { blocoDaFila, rotuloDoBloco, topicoDoBloco, totalDaFila, type BlocoFila, type Fila } from '@/lib/plano/fila';
import { concluirBlocoNaApi, voltarBlocoNaApi } from './api';
import { MINIMO_CRONOMETRO_SEG, PassoConcluir, type ValoresConcluir } from './PassoConcluir';

/** Título do bloco: o tópico, ou o que o bloco é quando não tem tópico. */
export function tituloDoBloco(bloco: BlocoFila, disciplina: DisciplinaPlano | undefined, topicoId: string | null): string {
  if (bloco.tipo === 'simulado') return 'Simulado';
  if (bloco.tipo === 'revisao_geral') return `Revisão geral de ${disciplina?.nome ?? 'matéria'}`;
  return disciplina?.topicos.find((t) => t.id === topicoId)?.nome ?? 'Todos os tópicos desta matéria estão concluídos.';
}

/**
 * "Próximo bloco": o bloco atual da fila com o cronômetro embutido (um só, vale para o bloco na
 * tela), "Concluir bloco" (passo curto) e "Voltar um bloco". O rascunho do cronômetro fica no
 * aparelho e só é apagado quando a sessão é gravada.
 */
export function CartaoProximoBloco({
  planoId,
  userId,
  fila,
  posicao,
  disciplinas,
  concluidos,
  indices,
  iniciarAoAbrir,
  atualizando,
  aoMudarPosicao,
  aoAtualizar,
}: {
  planoId: string;
  userId: string;
  fila: Fila;
  posicao: number;
  disciplinas: DisciplinaPlano[];
  concluidos: ReadonlySet<string>;
  indices: Map<string, number>;
  /** `?iniciar=1`: inicia (ou retoma) o cronômetro uma vez e tira o pedido da URL. */
  iniciarAoAbrir: boolean;
  /** A tela está buscando os dados novos do servidor. */
  atualizando: boolean;
  aoMudarPosicao: (posicao: number) => void;
  aoAtualizar: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const c = useCronometro(userId);
  const { estado, segundos, carregado } = c;
  const [passoDe, setPassoDe] = useState<number | null>(null);
  const [marca, setMarca] = useState<{ posicao: number; marcado: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const emVoo = useRef(false); // trava síncrona: dois cliques seguidos não fazem duas requisições
  const pedidoTratado = useRef(false);

  const bloco = blocoDaFila(fila, posicao);
  const total = totalDaFila(fila);
  const filaVazia = total === 0 || (fila.modo === 'ciclo' && fila.itens.length === 0);
  const disciplina = bloco ? disciplinas.find((d) => d.id === bloco.disciplinaId) : undefined;
  const topicoId = bloco && bloco.tipo === 'estudo' ? topicoDoBloco(bloco, fila, disciplinas, concluidos) : null;
  const jaConcluido = topicoId !== null && concluidos.has(topicoId);
  const marcado = marca?.posicao === posicao && marca.marcado;
  const ocupado = enviando || atualizando;
  const ativo = estado.rodando || estado.acumuladoSeg > 0;
  // O passo vale para o bloco em que foi aberto: se a fila andou (outra aba), ele fecha.
  const passoAberto = bloco !== null && passoDe === posicao;
  const indice = bloco ? (indices.get(bloco.disciplinaId) ?? -1) : -1;

  /** Parado e zerado: começa o bloco da tela; com tempo marcado: retoma. */
  const iniciarCronometro = () =>
    ativo || !bloco ? c.iniciar() : c.iniciar({ ...FORMULARIO_VAZIO, disciplinaId: bloco.disciplinaId, topicoId });

  function iniciar() {
    setAnuncio('');
    iniciarCronometro();
  }

  // Página escondida pela Activity (navegação): fecha o passo e esquece mensagens e o pedido tratado.
  useLayoutEffect(
    () => () => {
      pedidoTratado.current = false;
      setPassoDe(null);
      setErro(null);
      setAnuncio('');
    },
    [],
  );

  useEffect(() => {
    if (!iniciarAoAbrir) {
      pedidoTratado.current = false;
      return;
    }
    if (!carregado || pedidoTratado.current) return;
    pedidoTratado.current = true;
    if (!estado.rodando && bloco) iniciarCronometro();
    // A URL sai na hora; o `replace` traz a página do servidor sem o pedido, para ele não valer de novo.
    window.history.replaceState(null, '', '/app/plano');
    router.replace('/app/plano', { scroll: false });
  });

  async function concluir(valores: ValoresConcluir, avancar: boolean) {
    if (emVoo.current || !bloco) return;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    setAnuncio('');
    const doCronometro = segundos >= MINIMO_CRONOMETRO_SEG;
    const r = await concluirBlocoNaApi(planoId, {
      posicaoEsperada: posicao,
      ...valores,
      concluirTopico: topicoId !== null && !jaConcluido && marcado,
      avancar,
      origem: doCronometro ? 'cronometro' : 'rapido',
    });
    emVoo.current = false;
    setEnviando(false);
    if (r.ok) {
      // O tempo do cronômetro foi gravado: zera. Menos de 30 s não entrou na sessão e segue contando
      // (o rascunho é um só para todas as abas; outra aba pode estar usando esse tempo).
      if (doCronometro) c.limpar();
      setPassoDe(null);
      setMarca(null);
      aoMudarPosicao(r.posicao);
      setAnuncio(avancar ? 'Bloco concluído.' : 'Sessão salva.');
      aoAtualizar();
      return;
    }
    // 409 (a fila mudou ou acabou): o rascunho do cronômetro fica; a tela busca a fila atual.
    setErro(r.erro);
    if (r.status === 409) aoAtualizar();
  }

  async function voltar() {
    if (emVoo.current || posicao === 0) return;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    setAnuncio('');
    const r = await voltarBlocoNaApi(planoId, posicao);
    emVoo.current = false;
    setEnviando(false);
    if (r.ok) {
      setPassoDe(null);
      aoMudarPosicao(r.posicao);
      setAnuncio('Voltou um bloco.');
      aoAtualizar();
      return;
    }
    setErro(r.erro);
    if (r.status === 409) aoAtualizar();
  }

  const botaoVoltar = (
    <button
      type="button"
      className={`${botaoTextoNavy} max-sm:-ml-3`}
      disabled={posicao === 0 || ocupado}
      onClick={() => void voltar()}
    >
      <Undo2 aria-hidden className="size-4" />
      Voltar um bloco
    </button>
  );

  return (
    <section
      aria-labelledby={`${id}-titulo`}
      className="agora-entrada sobre-navy relative isolate overflow-hidden rounded-destaque bg-navy text-na-navy shadow-destaque"
      style={indice >= 0 ? estiloMateria(indice) : undefined}
    >
      {/* Faixa da cor da matéria: liga o destaque às bolinhas da grade e do menu. */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[var(--cor-materia,var(--mint))]" />
      <div className="flex flex-col gap-5 py-6 pl-6 pr-5 sm:py-8 sm:pl-10 sm:pr-8">
        <h2 id={`${id}-titulo`} className="text-xl font-semibold tracking-tight text-mint">
          Próximo bloco
        </h2>

        {filaVazia ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">Sem blocos para estudar.</p>
            <Link href="/app/novo" className={botaoMint}>
              Novo plano
            </Link>
          </div>
        ) : !bloco ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2rem]">
              Você chegou ao fim da fila.
            </p>
            {botaoVoltar}
          </div>
        ) : (
          <>
            {/* key = posição: ao concluir, o conteúdo do bloco seguinte entra (a transição do cartão). */}
            <div key={posicao} className="bloco-entrada flex flex-col gap-2.5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-na-navy-suave">
                {indice >= 0 && <span aria-hidden className="bolinha" />}
                <span className="text-na-navy">{disciplina?.nome ?? 'Matéria'}</span>
                <span aria-hidden>·</span>
                <span>{rotuloDoBloco(fila, posicao)}</span>
              </p>
              <h3 className="max-w-[32ch] text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-balance break-words sm:text-[2rem]">
                {tituloDoBloco(bloco, disciplina, topicoId)}
              </h3>
              <p className="flex items-center gap-1.5 text-na-navy-suave">
                <Clock aria-hidden className="size-4" />
                {formatarMinutos(bloco.minutos)} previstos
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
              <div
                className="relogio-anel flex w-full items-center justify-between gap-1 rounded-linha bg-white/8 p-1 pr-4 sm:w-auto sm:justify-start"
                data-rodando={estado.rodando ? 'true' : 'false'}
              >
                {estado.rodando ? (
                  <button type="button" className={botaoMint} onClick={c.pausar}>
                    <Pause aria-hidden className="size-4 fill-current" />
                    Pausar
                  </button>
                ) : (
                  <button type="button" className={botaoMint} disabled={!carregado} onClick={iniciar}>
                    <Play aria-hidden className="size-4 fill-current" />
                    {ativo ? 'Retomar' : 'Iniciar'}
                  </button>
                )}
                <p
                  role="timer"
                  aria-label="Tempo de estudo"
                  className="min-w-[6.5ch] pl-3 text-2xl font-semibold leading-none tracking-tight tabular-nums"
                >
                  {formatarRelogio(segundos)}
                </p>
              </div>
              {!passoAberto && (
                <div className="flex w-full flex-wrap items-center gap-x-1 gap-y-1 sm:ml-auto sm:w-auto">
                  <button
                    type="button"
                    className={`${botaoContornoNavy} grow whitespace-nowrap sm:grow-0`}
                    disabled={ocupado}
                    onClick={() => {
                      setErro(null);
                      setAnuncio('');
                      setPassoDe(posicao);
                    }}
                  >
                    <Check aria-hidden className="size-4" />
                    Concluir bloco
                  </button>
                  {botaoVoltar}
                </div>
              )}
            </div>

            {passoAberto ? (
              <PassoConcluir
                segundos={segundos}
                minutosDoBloco={bloco.minutos}
                marca={{
                  existe: topicoId !== null,
                  jaConcluido,
                  marcado,
                  aoMudar: (m) => setMarca({ posicao, marcado: m }),
                }}
                enviando={ocupado}
                aoEnviar={(v, avancar) => void concluir(v, avancar)}
                aoCancelar={() => {
                  setErro(null);
                  setPassoDe(null);
                }}
                aoErro={setErro}
              />
            ) : (
              topicoId !== null && (
                <label className="-mt-1 flex min-h-11 w-fit cursor-pointer items-center gap-3 text-na-navy-suave transition-colors hover:text-na-navy has-disabled:cursor-default has-disabled:hover:text-na-navy-suave">
                  <Bolha
                    checked={jaConcluido || marcado}
                    disabled={jaConcluido}
                    onChange={(e) => setMarca({ posicao, marcado: e.target.checked })}
                  />
                  {jaConcluido ? 'Tópico já concluído' : 'Concluí este tópico'}
                </label>
              )
            )}
          </>
        )}

        {erro && (
          <p role="alert" className="rounded-linha border-l-4 border-rust bg-white/8 px-4 py-3 text-sm text-na-navy">
            {erro}
          </p>
        )}
        <p role="status" className={anuncio ? 'flex items-center gap-2 text-sm text-mint' : 'sr-only'}>
          {anuncio && <CheckAnimado className="size-4" />}
          {anuncio}
        </p>
      </div>
    </section>
  );
}
