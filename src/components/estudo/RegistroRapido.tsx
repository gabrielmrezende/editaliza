'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import { alerta, botaoPrimario, campo, rotulo } from '@/components/estilos';
import { INTERVALOS_REVISAO } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { registrarSessao } from './api';

interface UltimoRegistro {
  disciplinaId: string;
  topicoId: string | null;
}

export function chaveUltimoRegistro(userId: string): string {
  return `editaliza:ultimo-registro:${userId}`;
}

function lerUltimo(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** Última escolha guardada, se ainda existir no plano (matéria e, se houver, tópico dela). */
function interpretar(bruto: string | null, disciplinas: DisciplinaPlano[]): UltimoRegistro | null {
  if (!bruto) return null;
  try {
    const v = JSON.parse(bruto) as Partial<UltimoRegistro>;
    const disciplina = disciplinas.find((d) => d.id === v.disciplinaId);
    if (!disciplina) return null;
    const topico = disciplina.topicos.find((t) => t.id === v.topicoId);
    return { disciplinaId: disciplina.id, topicoId: topico?.id ?? null };
  } catch {
    return null;
  }
}

const nadaAssinar = () => () => {};

/**
 * Registro rápido avulso (matéria, tópico, minutos): grava com a data de hoje, origem `rapido` e
 * as revisões padrão, e lembra a última matéria/tópico usados.
 */
export function RegistroRapido({
  userId,
  planoId,
  hoje,
  disciplinas,
}: {
  userId: string;
  planoId: string;
  hoje: string;
  disciplinas: DisciplinaPlano[];
}) {
  const id = useId();
  const chave = chaveUltimoRegistro(userId);
  // Lido uma vez do navegador (no servidor não há); a escolha do aluno na tela vence.
  const guardado = useSyncExternalStore(
    nadaAssinar,
    () => lerUltimo(chave),
    () => null,
  );
  const [escolha, setEscolha] = useState<UltimoRegistro | null>(null);
  const [minutos, setMinutos] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [salvando, setSalvando] = useState(false);

  const atual = escolha ?? interpretar(guardado, disciplinas);
  const disciplinaId = atual?.disciplinaId ?? '';
  const topicoId = atual?.topicoId ?? '';
  const disciplina = disciplinas.find((d) => d.id === disciplinaId);

  function escolher(novo: UltimoRegistro | null) {
    setEscolha(novo ?? { disciplinaId: '', topicoId: null });
    setAnuncio('');
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    const m = minutos.trim();
    if (!disciplina) return setErro('Escolha a matéria.');
    if (!/^\d+$/.test(m) || Number(m) < 1 || Number(m) > 1440) {
      return setErro('Os minutos precisam ser um número inteiro de 1 a 1440.');
    }
    setErro(null);
    setSalvando(true);
    try {
      const topico = topicoId || null;
      await registrarSessao({
        planoId,
        data: hoje,
        disciplinaId: disciplina.id,
        topicoId: topico,
        minutos: Number(m),
        acertos: 0,
        erros: 0,
        tipo: null,
        observacao: null,
        origem: 'rapido',
        intervalos: topico ? [...INTERVALOS_REVISAO] : [],
        concluir: false,
      });
      try {
        localStorage.setItem(chave, JSON.stringify({ disciplinaId: disciplina.id, topicoId: topico }));
      } catch {
        // Sem armazenamento: só não lembra a escolha na próxima visita.
      }
      setEscolha({ disciplinaId: disciplina.id, topicoId: topico });
      setMinutos('');
      setAnuncio('Sessão registrada');
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Algo deu errado. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4 rounded-xl border border-linha bg-folha p-4 sm:p-5">
      <div>
        <h2 id={`${id}-titulo`} className="text-xl font-bold tracking-tight">
          Registro rápido
        </h2>
        <p className="text-sm text-tinta-suave">Já estudou? Registre só o tempo; as revisões entram no padrão.</p>
      </div>
      <form noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-disciplina`} className={rotulo}>
              Matéria
            </label>
            <select
              id={`${id}-disciplina`}
              className={`${campo} min-h-11`}
              value={disciplinaId}
              onChange={(e) => escolher(e.target.value ? { disciplinaId: e.target.value, topicoId: null } : null)}
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
              value={topicoId}
              disabled={!disciplina}
              onChange={(e) => escolher({ disciplinaId, topicoId: e.target.value || null })}
            >
              <option value="">Sem tópico específico</option>
              {disciplina?.topicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-minutos`} className={rotulo}>
              Minutos
            </label>
            <input
              id={`${id}-minutos`}
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              step={1}
              className={`${campo} min-h-11`}
              value={minutos}
              onChange={(e) => {
                setMinutos(e.target.value);
                setAnuncio('');
              }}
            />
          </div>
        </div>
        {erro && (
          <p role="alert" className={alerta}>
            {erro}
          </p>
        )}
        <div>
          <button type="submit" className={botaoPrimario} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
        <p role="status" className="font-bold text-caneta">
          {anuncio}
        </p>
      </form>
    </section>
  );
}
