'use client';

import { useState } from 'react';
import { MSG_SEM_HORAS } from '@/lib/planos/mensagens';
import { alerta } from '../estilos';
import { formatarHoras, lerHoras } from './horas';
import { Navegacao } from './Navegacao';

/** Ordem de exibição (segunda primeiro); o índice é o de Date.getDay() (0 = domingo). */
const DIAS = [
  { indice: 1, nome: 'Segunda' },
  { indice: 2, nome: 'Terça' },
  { indice: 3, nome: 'Quarta' },
  { indice: 4, nome: 'Quinta' },
  { indice: 5, nome: 'Sexta' },
  { indice: 6, nome: 'Sábado' },
  { indice: 0, nome: 'Domingo' },
];

/** Padrão: Seg–Sex 2 h, Sáb 4 h, Dom 0 (índice = getDay). */
export const HORAS_PADRAO = ['0', '2', '2', '2', '2', '2', '4'];

/** Etapa 5: horas disponíveis em cada dia da semana (aceita "1,5" e "1.5"). */
export function Disponibilidade({
  horas,
  aoMudar,
  aoContinuar,
  aoVoltar,
}: {
  horas: string[];
  aoMudar: (h: string[]) => void;
  aoContinuar: () => void;
  aoVoltar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const minutos = horas.map(lerHoras);
  const total = minutos.reduce<number>((s, m) => s + (m ?? 0), 0);

  function continuar() {
    const invalido = DIAS.find((d) => minutos[d.indice] === null);
    if (invalido) return setErro(`Confira ${invalido.nome.toLowerCase()}: use números de 0 a 24, como 2 ou 1,5.`);
    if (total === 0) return setErro(MSG_SEM_HORAS);
    aoContinuar();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-tinta-suave">Quantas horas você consegue estudar em cada dia? Use 1,5 para uma hora e meia.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {DIAS.map((d) => {
          const invalido = minutos[d.indice] === null;
          return (
            <label
              key={d.indice}
              className="flex items-center justify-between gap-3 rounded-lg border border-linha bg-folha px-4 py-2 sm:flex-col sm:items-stretch sm:px-2 sm:py-3"
            >
              <span className="font-bold sm:text-center sm:text-sm">{d.nome}</span>
              <span className="flex items-baseline gap-1 sm:justify-center">
                <input
                  aria-label={d.nome}
                  inputMode="decimal"
                  autoComplete="off"
                  value={horas[d.indice]}
                  aria-invalid={invalido}
                  onChange={(e) => {
                    setErro(null);
                    aoMudar(horas.map((h, i) => (i === d.indice ? e.target.value : h)));
                  }}
                  className={`w-16 rounded-md border bg-folha px-2 py-2 text-center text-lg font-bold focus:border-caneta focus:outline-none sm:w-full ${
                    invalido ? 'border-erro' : 'border-linha'
                  }`}
                />
                <span aria-hidden className="text-tinta-suave">
                  h
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p aria-live="polite" className="font-bold">
        {formatarHoras(total)} h por semana
      </p>
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <Navegacao aoVoltar={aoVoltar} aoContinuar={continuar} />
    </div>
  );
}
