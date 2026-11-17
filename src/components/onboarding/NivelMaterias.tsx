'use client';

import type { Disciplina, Nivel } from '@/lib/dominio/tipos';
import { alerta } from '../estilos';
import { Navegacao } from './Navegacao';
import type { Niveis } from './tipos';

const OPCOES: { valor: Nivel; texto: string }[] = [
  { valor: 'nunca_vi', texto: 'Nunca vi' },
  { valor: 'basico', texto: 'Básico' },
  { valor: 'domino', texto: 'Domino' },
];

/** Etapa 6: nível do aluno em cada matéria (padrão básico) e geração do plano. */
export function NivelMaterias({
  disciplinas,
  niveis,
  erro,
  gerando,
  aoMudar,
  aoGerar,
  aoVoltar,
}: {
  disciplinas: Disciplina[];
  niveis: Niveis;
  erro: string | null;
  gerando: boolean;
  aoMudar: (n: Niveis) => void;
  aoGerar: () => void;
  aoVoltar: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-texto-suave">Matérias que você nunca viu recebem mais tempo; as que você domina, menos.</p>
      <div className="flex flex-col divide-y divide-borda rounded-cartao border border-borda bg-superficie">
        {disciplinas.map((d) => (
          <fieldset key={d.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <legend className="float-left font-semibold sm:max-w-[50%]">{d.nome}</legend>
            <div className="clear-left grid grid-cols-3 gap-1 rounded-linha bg-fundo p-1 sm:clear-none">
              {OPCOES.map((o) => (
                <label key={o.valor} className="relative">
                  <input
                    type="radio"
                    name={`nivel-${d.id}`}
                    value={o.valor}
                    checked={(niveis[d.id] ?? 'basico') === o.valor}
                    onChange={() => aoMudar({ ...niveis, [d.id]: o.valor })}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-linha px-3 text-sm font-semibold text-texto-suave transition-colors peer-checked:bg-texto peer-checked:text-fundo peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-foco">
                    {o.texto}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      {gerando && (
        <p role="status" className="sr-only">
          Gerando seu plano.
        </p>
      )}
      <Navegacao
        aoVoltar={aoVoltar}
        aoContinuar={aoGerar}
        ocupado={gerando}
        textoContinuar={gerando ? 'Gerando…' : 'Gerar meu plano'}
      />
    </div>
  );
}
