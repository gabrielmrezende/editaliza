'use client';

import { useState } from 'react';
import type { Disciplina } from '@/lib/dominio/tipos';
import { alerta, botaoSecundario } from '../estilos';
import { DisciplinaEditavel } from './DisciplinaEditavel';
import { novoId } from './ids';
import { validarConteudo } from './validacao';
import { Navegacao } from './Navegacao';

function todosOsIds(disciplinas: Disciplina[]): Set<string> {
  return new Set(disciplinas.flatMap((d) => [d.id, ...d.topicos.map((t) => t.id)]));
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

/** Etapa 3: o aluno confere e corrige matérias e tópicos extraídos do edital. */
export function RevisaoConteudo({
  disciplinas,
  pesosInformados,
  aoMudar,
  aoContinuar,
  aoVoltar,
}: {
  disciplinas: Disciplina[];
  pesosInformados: boolean;
  aoMudar: (d: Disciplina[]) => void;
  aoContinuar: () => void;
  aoVoltar: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [focoId, setFocoId] = useState<string | null>(null);
  const totalTopicos = disciplinas.reduce((s, d) => s + d.topicos.length, 0);

  const mudar = (lista: Disciplina[]) => {
    setErro(null);
    aoMudar(lista);
  };

  function adicionarTopico(i: number) {
    const d = disciplinas[i];
    const id = novoId(`${d.id}-`, todosOsIds(disciplinas));
    setFocoId(id);
    mudar(disciplinas.map((x, k) => (k === i ? { ...x, topicos: [...x.topicos, { id, nome: '' }] } : x)));
  }

  function adicionarMateria() {
    const id = novoId('', todosOsIds(disciplinas));
    setFocoId(id);
    mudar([...disciplinas, { id, nome: '', questoes: null, pontos: null, topicos: [] }]);
  }

  function continuar() {
    const problema = validarConteudo(disciplinas);
    if (problema) setErro(problema);
    else aoContinuar();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-tinta-suave">
        Corrija o que a leitura do edital errou: renomeie, acrescente ou remova matérias e tópicos. As mudanças valem só
        para o seu plano.
      </p>
      {!pesosInformados && (
        <p className="rounded-md border-l-4 border-caneta bg-caneta-clara px-4 py-3">
          Este edital não informa o peso das matérias. Se souber, preencha o número de questões; senão, usaremos peso igual.
        </p>
      )}
      <p aria-live="polite" className="text-sm font-bold">
        {plural(totalTopicos, 'tópico', 'tópicos')} em {plural(disciplinas.length, 'matéria', 'matérias')}
      </p>

      <div className="flex flex-col gap-4">
        {disciplinas.map((d, i) => (
          <DisciplinaEditavel
            key={d.id}
            disciplina={d}
            focoId={focoId}
            aoFocado={() => setFocoId(null)}
            aoMudar={(nova) => mudar(disciplinas.map((x, k) => (k === i ? nova : x)))}
            aoRemover={() => mudar(disciplinas.filter((_, k) => k !== i))}
            aoAdicionarTopico={() => adicionarTopico(i)}
          />
        ))}
      </div>
      <div>
        <button type="button" onClick={adicionarMateria} className={botaoSecundario}>
          Adicionar matéria
        </button>
      </div>

      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <Navegacao aoVoltar={aoVoltar} aoContinuar={continuar} />
    </div>
  );
}
