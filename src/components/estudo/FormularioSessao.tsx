'use client';

import { useId, useState, type ReactNode } from 'react';
import { CheckAnimado } from '@/components/CheckAnimado';
import { alerta, botaoPrimario, campo, cartao, rotulo } from '@/components/estilos';
import { somarDias } from '@/lib/datas';
import { INTERVALOS_REVISAO, TIPOS_SESSAO, type TipoSessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { registrarSessao } from './api';

export const ROTULO_TIPO: Record<TipoSessao, string> = {
  teoria: 'Teoria',
  questoes: 'Questões',
  revisao: 'Revisão',
  simulado: 'Simulado',
  lei_seca: 'Lei seca',
  jurisprudencia: 'Jurisprudência',
  discursiva: 'Discursiva',
};

/** Valores dos campos como na tela ('' = vazio / nulo). */
export interface ValoresSessao {
  data: string;
  disciplinaId: string;
  topicoId: string;
  minutos: string;
  acertos: string;
  erros: string;
  tipo: string;
  observacao: string;
  intervalos: number[];
  concluir: boolean;
}

/** Sessão validada, pronta para a API (sem plano nem origem, que quem chama completa). */
export interface DadosSessao {
  data: string;
  disciplinaId: string;
  topicoId: string | null;
  minutos: number;
  acertos: number;
  erros: number;
  tipo: TipoSessao | null;
  observacao: string | null;
  intervalos: number[];
  concluir: boolean;
}

export type ModoFormulario = 'cronometro' | 'manual' | 'edicao';

const MSG_SALVO = 'Sessão registrada';
const MAX_OBSERVACAO = 1000;

function valoresPadrao(hoje: string, inicial?: Partial<ValoresSessao>): ValoresSessao {
  return {
    data: hoje,
    disciplinaId: '',
    topicoId: '',
    minutos: '',
    acertos: '',
    erros: '',
    tipo: '',
    observacao: '',
    intervalos: [...INTERVALOS_REVISAO],
    concluir: false,
    ...inicial,
  };
}

const inteiro = (texto: string, padrao: number | null): number | null => {
  const t = texto.trim();
  if (t === '') return padrao;
  return /^\d+$/.test(t) ? Number(t) : null;
};

/** Confere os campos com as mesmas regras do servidor; devolve a mensagem do primeiro erro. */
export function validarSessao(
  v: ValoresSessao,
  hoje: string,
  modo: ModoFormulario,
): { ok: true; dados: DadosSessao } | { ok: false; erro: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.data)) return { ok: false, erro: 'Informe a data.' };
  if (v.data > hoje) return { ok: false, erro: 'A data não pode ser no futuro.' };
  if (v.data < somarDias(hoje, -365)) return { ok: false, erro: 'A data pode ser de no máximo 1 ano atrás.' };
  if (!v.disciplinaId) return { ok: false, erro: 'Escolha a matéria.' };
  const minutos = inteiro(v.minutos, 0);
  if (minutos === null || minutos > 1440) {
    return { ok: false, erro: 'Os minutos precisam ser um número inteiro de 0 a 1440.' };
  }
  const acertos = inteiro(v.acertos, 0);
  const erros = inteiro(v.erros, 0);
  if (acertos === null || erros === null || acertos > 10_000 || erros > 10_000) {
    return { ok: false, erro: 'Acertos e erros precisam ser números inteiros de 0 a 10000.' };
  }
  if (minutos === 0 && acertos + erros === 0) return { ok: false, erro: 'Informe o tempo ou as questões.' };
  const observacao = v.observacao.trim();
  if (observacao.length > MAX_OBSERVACAO) {
    return { ok: false, erro: `A observação pode ter no máximo ${MAX_OBSERVACAO} caracteres.` };
  }
  const topicoId = v.topicoId || null;
  const comRevisoes = topicoId !== null && modo !== 'edicao';
  return {
    ok: true,
    dados: {
      data: v.data,
      disciplinaId: v.disciplinaId,
      topicoId,
      minutos,
      acertos,
      erros,
      tipo: (TIPOS_SESSAO as readonly string[]).includes(v.tipo) ? (v.tipo as TipoSessao) : null,
      observacao: observacao === '' ? null : observacao,
      intervalos: comRevisoes ? INTERVALOS_REVISAO.filter((i) => v.intervalos.includes(i)) : [],
      concluir: comRevisoes && v.concluir,
    },
  };
}

/**
 * Formulário de uma sessão de estudo (spec §7.2). No modo "manual" limpa os campos e anuncia
 * "Sessão registrada" depois de salvar; no "cronometro" quem chama decide o que fazer; no
 * "edicao" a matéria fica travada e não há revisões nem conclusão (`travarTopico` trava também o
 * tópico: sessão de plano antigo ou de matéria que saiu do plano).
 */
export function FormularioSessao({
  modo,
  disciplinas,
  hoje,
  inicial,
  aoSalvar,
  aoMudar,
  acoes,
  travarTopico = false,
}: {
  modo: ModoFormulario;
  disciplinas: DisciplinaPlano[];
  /** Hoje (aaaa-mm-dd) em São Paulo, calculado no servidor. */
  hoje: string;
  inicial?: Partial<ValoresSessao>;
  /** Grava; em falha, lança `Error` com a mensagem a mostrar. */
  aoSalvar: (dados: DadosSessao) => Promise<void>;
  aoMudar?: (valores: ValoresSessao) => void;
  /** Botões extras ao lado de "Salvar sessão". */
  acoes?: ReactNode;
  /** Só na edição: o tópico também não pode mudar. */
  travarTopico?: boolean;
}) {
  const id = useId();
  const [valores, setValores] = useState(() => valoresPadrao(hoje, inicial));
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [salvando, setSalvando] = useState(false);

  const disciplina = disciplinas.find((d) => d.id === valores.disciplinaId);
  const comTopico = Boolean(valores.topicoId) && modo !== 'edicao';

  function mudar(parcial: Partial<ValoresSessao>) {
    const novo = { ...valores, ...parcial };
    setValores(novo);
    setAnuncio('');
    aoMudar?.(novo);
  }

  function alternarIntervalo(intervalo: number, marcado: boolean) {
    const resto = valores.intervalos.filter((i) => i !== intervalo);
    mudar({ intervalos: marcado ? [...resto, intervalo] : resto });
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const r = validarSessao(valores, hoje, modo);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await aoSalvar(r.dados);
      if (modo === 'manual') {
        setValores(valoresPadrao(hoje, inicial));
        setAnuncio(MSG_SALVO);
      }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const campoId = (nome: string) => `${id}-${nome}`;

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={campoId('disciplina')} className={rotulo}>
            Matéria
          </label>
          <select
            id={campoId('disciplina')}
            className={`${campo} min-h-11`}
            value={valores.disciplinaId}
            disabled={modo === 'edicao'}
            onChange={(e) => mudar({ disciplinaId: e.target.value, topicoId: '', concluir: false })}
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
          <label htmlFor={campoId('topico')} className={rotulo}>
            Tópico
          </label>
          <select
            id={campoId('topico')}
            className={`${campo} min-h-11`}
            value={valores.topicoId}
            disabled={!disciplina || (modo === 'edicao' && travarTopico)}
            onChange={(e) => mudar({ topicoId: e.target.value, concluir: e.target.value ? valores.concluir : false })}
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

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="col-span-3 flex flex-col gap-1 sm:col-span-1">
          <label htmlFor={campoId('data')} className={rotulo}>
            Data
          </label>
          <input
            id={campoId('data')}
            type="date"
            className={`${campo} min-h-11`}
            value={valores.data}
            max={hoje}
            min={somarDias(hoje, -365)}
            onChange={(e) => mudar({ data: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={campoId('minutos')} className={rotulo}>
            Minutos
          </label>
          <input
            id={campoId('minutos')}
            type="number"
            inputMode="numeric"
            min={0}
            max={1440}
            step={1}
            className={`${campo} min-h-11`}
            value={valores.minutos}
            onChange={(e) => mudar({ minutos: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={campoId('acertos')} className={rotulo}>
            Acertos
          </label>
          <input
            id={campoId('acertos')}
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            step={1}
            className={`${campo} min-h-11`}
            value={valores.acertos}
            onChange={(e) => mudar({ acertos: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={campoId('erros')} className={rotulo}>
            Erros
          </label>
          <input
            id={campoId('erros')}
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            step={1}
            className={`${campo} min-h-11`}
            value={valores.erros}
            onChange={(e) => mudar({ erros: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={campoId('tipo')} className={rotulo}>
          Tipo
        </label>
        <select
          id={campoId('tipo')}
          className={`${campo} min-h-11`}
          value={valores.tipo}
          onChange={(e) => mudar({ tipo: e.target.value })}
        >
          <option value="">Não informar</option>
          {TIPOS_SESSAO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={campoId('observacao')} className={rotulo}>
          Observação
        </label>
        <textarea
          id={campoId('observacao')}
          rows={2}
          maxLength={MAX_OBSERVACAO}
          className={campo}
          value={valores.observacao}
          onChange={(e) => mudar({ observacao: e.target.value })}
        />
      </div>

      {comTopico && (
        <>
          <fieldset className="flex flex-col gap-1">
            <legend className={`${rotulo} mb-1`}>Agendar revisões</legend>
            <div className="flex flex-wrap gap-2">
              {INTERVALOS_REVISAO.map((i) => (
                <label
                  key={i}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-linha border border-borda bg-superficie-alt py-1 pl-2 pr-3 text-sm font-semibold text-texto-medio has-checked:border-mint-forte has-checked:text-texto"
                >
                  <input
                    type="checkbox"
                    className="bolha"
                    checked={valores.intervalos.includes(i)}
                    onChange={(e) => alternarIntervalo(i, e.target.checked)}
                  />
                  {i === 1 ? 'Em 1 dia' : `Em ${i} dias`}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-bold">
            <input
              type="checkbox"
              className="bolha"
              checked={valores.concluir}
              onChange={(e) => mudar({ concluir: e.target.checked })}
            />
            Concluí este tópico
          </label>
        </>
      )}

      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={botaoPrimario} disabled={salvando}>
          {salvando ? 'Salvando…' : modo === 'edicao' ? 'Salvar alterações' : 'Salvar sessão'}
        </button>
        {acoes}
      </div>
      {modo === 'manual' && (
        <p role="status" className="flex items-center gap-2 text-sm font-bold text-ok">
          {anuncio && <CheckAnimado />}
          {anuncio}
        </p>
      )}
    </form>
  );
}

/** Seção "Registrar sessão": formulário manual ligado a POST /api/sessoes. */
export function RegistroManual({
  planoId,
  disciplinas,
  hoje,
}: {
  planoId: string;
  disciplinas: DisciplinaPlano[];
  hoje: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-titulo`} className={`${cartao} flex flex-col gap-4 p-4 sm:p-6`}>
      <div>
        <h2 id={`${id}-titulo`} className="text-xl font-extrabold tracking-tight">
          Registrar sessão
        </h2>
        <p className="text-sm text-texto-suave">Estudou sem o cronômetro? Informe o tempo, as questões e as revisões.</p>
      </div>
      <FormularioSessao
        modo="manual"
        disciplinas={disciplinas}
        hoje={hoje}
        aoSalvar={async (dados) => {
          await registrarSessao({ ...dados, planoId, origem: 'manual' });
        }}
      />
    </section>
  );
}
