'use client';

import { useId, useState } from 'react';
import { Bolha } from '@/components/plano/Bolha';
import { formatarDuracao } from '@/components/estudo/useCronometro';
import { ESQUECIDO_SEG, minutosParaRegistro } from '@/lib/acompanhamento/cronometro';
import { MSG_TEMPO_OU_QUESTOES } from '@/lib/acompanhamento/mensagens';
import { botaoContornoNavy, botaoMint, botaoTextoNavy, campoNavy } from '@/components/estilos';

/** O cronômetro conta como estudo registrado a partir disto; abaixo, valem os minutos do bloco. */
export const MINIMO_CRONOMETRO_SEG = 30;

export interface ValoresConcluir {
  minutos: number;
  acertos: number;
  erros: number;
}

/** Caixa "Concluí este tópico" do bloco (a mesma do cartão). */
export interface MarcaTopico {
  /** O bloco tem tópico (estudo com tópico pendente ou do prazo). */
  existe: boolean;
  jaConcluido: boolean;
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
}

const inteiro = (texto: string, padrao: number): number | null => {
  const t = texto.trim();
  if (t === '') return padrao;
  return /^\d+$/.test(t) ? Number(t) : null;
};

function validar(minutos: string, acertos: string, erros: string): ValoresConcluir | string {
  const m = inteiro(minutos, 0);
  if (m === null || m > 1440) return 'Os minutos precisam ser um número inteiro de 0 a 1440.';
  const a = inteiro(acertos, 0);
  const e = inteiro(erros, 0);
  if (a === null || e === null || a > 10_000 || e > 10_000) {
    return 'Acertos e erros precisam ser números inteiros de 0 a 10000.';
  }
  if (m === 0 && a + e === 0) return MSG_TEMPO_OU_QUESTOES;
  return { minutos: m, acertos: a, erros: e };
}

/**
 * Passo curto de "Concluir bloco": minutos (do cronômetro se ele rodou ≥ 30 s, senão os previstos),
 * acertos e erros opcionais e a caixa do tópico. Erros vão para `aoErro` (o alerta do cartão).
 */
export function PassoConcluir({
  segundos,
  minutosDoBloco,
  marca,
  enviando,
  aoEnviar,
  aoCancelar,
  aoErro,
}: {
  segundos: number;
  minutosDoBloco: number;
  marca: MarcaTopico;
  enviando: boolean;
  aoEnviar: (valores: ValoresConcluir, avancar: boolean) => void;
  aoCancelar: () => void;
  aoErro: (mensagem: string) => void;
}) {
  const id = useId();
  // Fixado ao abrir: o cronômetro pode seguir contando enquanto o aluno confere.
  const [minutos, setMinutos] = useState(() =>
    String(segundos >= MINIMO_CRONOMETRO_SEG ? minutosParaRegistro(segundos) : minutosDoBloco),
  );
  const [acertos, setAcertos] = useState('');
  const [erros, setErros] = useState('');

  function enviar(avancar: boolean) {
    if (enviando) return;
    const r = validar(minutos, acertos, erros);
    if (typeof r === 'string') aoErro(r);
    else aoEnviar(r, avancar);
  }

  const campos = [
    { chave: 'minutos', rotulo: 'Minutos', valor: minutos, mudar: setMinutos },
    { chave: 'acertos', rotulo: 'Acertos', valor: acertos, mudar: setAcertos },
    { chave: 'erros', rotulo: 'Erros', valor: erros, mudar: setErros },
  ];

  return (
    <form
      aria-label="Concluir o bloco"
      className="bloco-entrada flex flex-col gap-4 rounded-cartao border border-white/12 bg-white/6 p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        enviar(true);
      }}
    >
      <div className="grid grid-cols-3 gap-3 sm:max-w-md">
        {campos.map((c) => (
          <div key={c.chave} className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${id}-${c.chave}`} className="text-sm text-na-navy-suave">
              {c.rotulo}
            </label>
            <input
              id={`${id}-${c.chave}`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={c.chave === 'minutos' ? undefined : '0'}
              className={campoNavy}
              value={c.valor}
              onChange={(e) => c.mudar(e.target.value)}
            />
          </div>
        ))}
      </div>

      {marca.existe && (
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-3 text-na-navy has-disabled:cursor-default">
          <Bolha
            checked={marca.jaConcluido || marca.marcado}
            disabled={marca.jaConcluido}
            onChange={(e) => marca.aoMudar(e.target.checked)}
          />
          {marca.jaConcluido ? 'Tópico já concluído' : 'Concluí este tópico'}
        </label>
      )}

      {segundos > ESQUECIDO_SEG && (
        <p className="rounded-linha border-l-4 border-aviso bg-white/8 px-4 py-3 text-sm text-na-navy">
          O cronômetro ficou ligado por {formatarDuracao(segundos)}. Confira o tempo antes de salvar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={botaoMint} disabled={enviando}>
          Concluir bloco
        </button>
        <button type="button" className={botaoContornoNavy} disabled={enviando} onClick={() => enviar(false)}>
          Salvar sem concluir
        </button>
        <button type="button" className={botaoTextoNavy} disabled={enviando} onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
