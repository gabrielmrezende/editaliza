'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Confirmacao } from '@/components/Dialogo';
import { botaoPrimario, botaoSecundario, campo, rotulo } from '@/components/estilos';
import { ESQUECIDO_SEG, minutosParaRegistro, type FormularioRascunho } from '@/lib/acompanhamento/cronometro';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { registrarSessao } from './api';
import { FormularioSessao, type ValoresSessao } from './FormularioSessao';
import { FORMULARIO_VAZIO, formatarDuracao, formatarRelogio, useCronometro } from './useCronometro';

/** Pedido vindo da URL (`?disciplina=&topico=&iniciar=1`, botão "Iniciar" de Hoje). */
export interface PedidoInicio {
  disciplinaId: string;
  topicoId: string | null;
}

/** Cronômetro de estudo com rascunho local; "Parar" abre o formulário de registro preenchido. */
export function Cronometro({
  userId,
  planoId,
  hoje,
  disciplinas,
  pedido,
}: {
  userId: string;
  planoId: string;
  hoje: string;
  disciplinas: DisciplinaPlano[];
  pedido: PedidoInicio | null;
}) {
  const id = useId();
  const router = useRouter();
  const c = useCronometro(userId);
  const { estado, segundos, formulario, carregado } = c;
  const [parado, setParado] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const [pedidoRecusado, setPedidoRecusado] = useState<PedidoInicio | null>(null);
  const pedidoTratado = useRef<string | null>(null);

  const ativo = estado.rodando || estado.acumuladoSeg > 0;
  // O formulário de parada só vale com o cronômetro pausado: se ele voltou a rodar (pedido
  // "Iniciar" do mesmo estudo, outra aba), o formulário dá lugar ao cronômetro.
  if (parado && estado.rodando) setParado(false);
  const disciplina = disciplinas.find((d) => d.id === formulario.disciplinaId);
  const nomeDisciplina = (idDisciplina: string | null) => disciplinas.find((d) => d.id === idDisciplina)?.nome;
  const minutos = minutosParaRegistro(segundos);

  // Pedido da URL: pré-seleciona e inicia; se já há outro cronômetro em andamento, pergunta antes.
  const chavePedido = pedido ? `${pedido.disciplinaId}|${pedido.topicoId ?? ''}` : null;
  const mesmoEstudo =
    pedido !== null && pedido.disciplinaId === formulario.disciplinaId && pedido.topicoId === formulario.topicoId;
  // Recusa vale para este pedido (objeto vindo do servidor); um novo clique em "Iniciar" pergunta de novo.
  const conflito = carregado && pedido !== null && pedidoRecusado !== pedido && ativo && !mesmoEstudo;

  const formularioDoPedido = (p: PedidoInicio): FormularioRascunho => ({
    ...FORMULARIO_VAZIO,
    disciplinaId: p.disciplinaId,
    topicoId: p.topicoId,
  });
  // A URL sai na hora (síncrono: se o aluno navegar logo em seguida, ela já não repete o pedido);
  // o `router.replace` traz a página sem o pedido do servidor, para ele não valer de novo.
  const tirarPedidoDaUrl = () => {
    window.history.replaceState(null, '', '/app/estudar');
    router.replace('/app/estudar', { scroll: false });
  };

  // A página escondida pela Activity (navegação) não desmonta: esquece o pedido já tratado e o
  // formulário de parada, para que um novo "Iniciar" do mesmo estudo seja atendido ao voltar.
  useLayoutEffect(
    () => () => {
      pedidoTratado.current = null;
      setParado(false);
    },
    [],
  );

  useEffect(() => {
    if (!chavePedido) {
      pedidoTratado.current = null;
      return;
    }
    if (!carregado || !pedido || pedidoTratado.current === chavePedido) return;
    if (ativo && !mesmoEstudo) return; // o diálogo de troca decide
    pedidoTratado.current = chavePedido;
    if (!mesmoEstudo) c.iniciar(formularioDoPedido(pedido));
    else if (!estado.rodando) c.iniciar();
    tirarPedidoDaUrl();
  });

  // Rascunho recuperado com matéria/tópico que não existem mais no plano: limpa a escolha.
  const topicoExiste = !formulario.topicoId || disciplina?.topicos.some((t) => t.id === formulario.topicoId);
  const escolhaInvalida = carregado && ((formulario.disciplinaId !== null && !disciplina) || !topicoExiste);
  useEffect(() => {
    if (!escolhaInvalida) return;
    c.setFormulario((atual) => {
      const d = disciplinas.find((x) => x.id === atual.disciplinaId);
      const t = d?.topicos.some((x) => x.id === atual.topicoId) ? atual.topicoId : null;
      return { ...atual, disciplinaId: d ? d.id : null, topicoId: t, concluir: t ? atual.concluir : false };
    });
  }, [escolhaInvalida, c, disciplinas]);

  function trocar() {
    if (!pedido) return;
    pedidoTratado.current = chavePedido;
    setParado(false);
    c.iniciar(formularioDoPedido(pedido));
    tirarPedidoDaUrl();
  }

  function manter() {
    pedidoTratado.current = chavePedido;
    setPedidoRecusado(pedido);
    tirarPedidoDaUrl();
  }

  function escolher(parcial: Partial<FormularioRascunho>) {
    setAnuncio('');
    c.setFormulario((atual) => ({ ...atual, ...parcial }));
  }

  function parar() {
    c.pausar();
    setAnuncio('');
    setParado(true);
  }

  function continuar() {
    setParado(false);
    c.iniciar();
  }

  function descartar() {
    setConfirmarDescarte(false);
    setParado(false);
    c.descartar();
  }

  function aoMudarFormulario(v: ValoresSessao) {
    c.setFormulario({
      disciplinaId: v.disciplinaId || null,
      topicoId: v.topicoId || null,
      tipo: v.tipo || null,
      acertos: v.acertos,
      erros: v.erros,
      observacao: v.observacao,
      intervalos: v.intervalos,
      concluir: v.concluir,
    });
  }

  const inicialFormulario: Partial<ValoresSessao> = {
    disciplinaId: formulario.disciplinaId ?? '',
    topicoId: formulario.topicoId ?? '',
    tipo: formulario.tipo ?? '',
    acertos: formulario.acertos,
    erros: formulario.erros,
    observacao: formulario.observacao,
    intervalos: formulario.intervalos,
    concluir: formulario.concluir,
    minutos: String(minutos),
  };

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 rounded-xl border border-linha bg-folha p-4 sm:p-5">
      <h2 id={`${id}-titulo`} className="text-xl font-bold tracking-tight">
        Cronômetro
      </h2>

      <p
        role="timer"
        aria-label="Tempo de estudo"
        className="font-mono text-5xl font-bold tabular-nums tracking-tight sm:text-6xl"
      >
        {formatarRelogio(segundos)}
      </p>

      <p role="status" className="text-sm text-tinta-suave">
        {anuncio ||
          (c.recuperado && ativo && !parado
            ? `Recuperamos o cronômetro${disciplina ? ` de ${disciplina.nome}` : ''} que estava em andamento.`
            : '')}
      </p>

      {!parado && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-disciplina`} className={rotulo}>
                Matéria
              </label>
              <select
                id={`${id}-disciplina`}
                className={`${campo} min-h-11`}
                value={formulario.disciplinaId ?? ''}
                disabled={!carregado}
                onChange={(e) => escolher({ disciplinaId: e.target.value || null, topicoId: null, concluir: false })}
              >
                <option value="">Escolha a matéria</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-topico`} className={rotulo}>
                Tópico
              </label>
              <select
                id={`${id}-topico`}
                className={`${campo} min-h-11`}
                value={formulario.topicoId ?? ''}
                disabled={!carregado || !disciplina}
                onChange={(e) => escolher({ topicoId: e.target.value || null })}
              >
                <option value="">Sem tópico específico</option>
                {disciplina?.topicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {estado.rodando ? (
              <button type="button" className={botaoPrimario} onClick={c.pausar}>
                Pausar
              </button>
            ) : (
              <button
                type="button"
                className={botaoPrimario}
                disabled={!carregado}
                onClick={() => {
                  setAnuncio('');
                  c.iniciar();
                }}
              >
                {ativo ? 'Continuar' : 'Iniciar'}
              </button>
            )}
            {ativo && (
              <>
                <button type="button" className={botaoSecundario} onClick={parar}>
                  Parar
                </button>
                <button type="button" className={botaoSecundario} onClick={() => setConfirmarDescarte(true)}>
                  Descartar
                </button>
              </>
            )}
          </div>
        </>
      )}

      {parado && minutos === 0 && (
        <div className="flex flex-col gap-3">
          <p>
            <strong>Menos de 1 minuto marcado.</strong> Não há tempo para registrar.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={botaoPrimario} onClick={continuar}>
              Continuar
            </button>
            <button type="button" className={botaoSecundario} onClick={descartar}>
              Descartar
            </button>
          </div>
        </div>
      )}

      {parado && minutos > 0 && (
        <>
          {segundos > ESQUECIDO_SEG && (
            <p className="rounded-md border-l-4 border-caneta bg-caneta-clara px-4 py-3 font-bold">
              O cronômetro ficou ligado por {formatarDuracao(segundos)}. Confira o tempo antes de salvar.
            </p>
          )}
          <FormularioSessao
            modo="cronometro"
            disciplinas={disciplinas}
            hoje={hoje}
            inicial={inicialFormulario}
            aoMudar={aoMudarFormulario}
            aoSalvar={async (dados) => {
              await registrarSessao({ ...dados, planoId, origem: 'cronometro' });
              c.limpar();
              setParado(false);
              setAnuncio('Sessão registrada');
            }}
            acoes={
              <>
                <button type="button" className={botaoSecundario} onClick={continuar}>
                  Continuar cronômetro
                </button>
                <button type="button" className={botaoSecundario} onClick={() => setConfirmarDescarte(true)}>
                  Descartar
                </button>
              </>
            }
          />
        </>
      )}

      <Confirmacao
        aberto={confirmarDescarte}
        titulo="Descartar o tempo?"
        confirmar="Descartar"
        cancelar="Cancelar"
        aoConfirmar={descartar}
        aoCancelar={() => setConfirmarDescarte(false)}
      >
        Os {formatarRelogio(segundos)} marcados não serão registrados.
      </Confirmacao>

      <Confirmacao
        aberto={conflito}
        titulo="Trocar de cronômetro?"
        confirmar="Trocar"
        cancelar="Manter o atual"
        aoConfirmar={trocar}
        aoCancelar={manter}
      >
        Já há um cronômetro {estado.rodando ? 'em andamento' : 'pausado'}
        {nomeDisciplina(formulario.disciplinaId) ? ` de ${nomeDisciplina(formulario.disciplinaId)}` : ''} (
        {formatarRelogio(segundos)}). Trocar descarta esse tempo e inicia{' '}
        {pedido ? nomeDisciplina(pedido.disciplinaId) : 'outra matéria'}.
      </Confirmacao>
    </section>
  );
}
