'use client';

import type { Disciplina } from '@/lib/dominio/tipos';
import { campo } from '../estilos';

const botaoRemover =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-tinta-suave transition-colors hover:bg-erro-claro hover:text-erro';

function Xis() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Uma matéria na revisão: nome, nº de questões e tópicos editáveis. */
export function DisciplinaEditavel({
  disciplina: d,
  focoId,
  aoFocado,
  aoMudar,
  aoRemover,
  aoAdicionarTopico,
}: {
  disciplina: Disciplina;
  focoId: string | null;
  /** Chamado depois de focar o campo recém-criado (o pai limpa focoId para não roubar o foco depois). */
  aoFocado: () => void;
  aoMudar: (d: Disciplina) => void;
  aoRemover: () => void;
  aoAdicionarTopico: () => void;
}) {
  const nome = d.nome.trim() || 'sem nome';
  const focar = (id: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (el && id === focoId) {
      el.focus();
      aoFocado();
    }
  };

  return (
    <section aria-label={`Matéria ${nome}`} className="rounded-xl border border-linha bg-folha">
      <div className="flex items-end gap-2 border-b border-linha p-4 sm:gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm text-tinta-suave">Matéria</span>
          <input
            ref={focar(d.id)}
            aria-label="Nome da matéria"
            value={d.nome}
            onChange={(e) => aoMudar({ ...d, nome: e.target.value })}
            className={`${campo} font-bold sm:text-lg`}
          />
        </label>
        <label className="flex w-20 flex-col gap-1 sm:w-24">
          <span className="text-sm text-tinta-suave">Questões</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={d.questoes ?? ''}
            onChange={(e) => {
              const n = Math.floor(Number(e.target.value));
              aoMudar({ ...d, questoes: e.target.value === '' || !Number.isFinite(n) ? null : Math.max(0, n) });
            }}
            className={campo}
          />
        </label>
        <button type="button" aria-label={`Remover matéria ${nome}`} title="Remover matéria" onClick={aoRemover} className={botaoRemover}>
          <Xis />
        </button>
      </div>

      {d.topicos.length === 0 ? (
        <p className="px-4 pt-3 text-sm text-tinta-suave">Sem tópicos: esta matéria fica fora do plano.</p>
      ) : (
        <ol className="flex flex-col gap-1 px-2 pt-3 sm:px-4">
          {d.topicos.map((t, j) => (
            <li key={t.id} className="flex items-start gap-1 sm:gap-2">
              <span aria-hidden className="w-6 shrink-0 pt-2.5 text-right text-sm text-tinta-suave">
                {j + 1}
              </span>
              <textarea
                ref={focar(t.id)}
                rows={1}
                aria-label={`Tópico ${j + 1} de ${nome}`}
                value={t.nome}
                onChange={(e) => {
                  // Tópico é uma linha só: Enter/colagem com quebras viram espaço.
                  const texto = e.target.value.replace(/\s*\n\s*/g, ' ');
                  aoMudar({ ...d, topicos: d.topicos.map((x) => (x.id === t.id ? { ...x, nome: texto } : x)) });
                }}
                className={`${campo} resize-none border-transparent bg-transparent leading-snug [field-sizing:content] hover:border-linha`}
              />
              <button
                type="button"
                aria-label={`Remover tópico ${t.nome.trim() || j + 1}`}
                title="Remover tópico"
                onClick={() => aoMudar({ ...d, topicos: d.topicos.filter((x) => x.id !== t.id) })}
                className={botaoRemover}
              >
                <Xis />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="px-4 pb-2 pt-1">
        <button type="button" onClick={aoAdicionarTopico} className="min-h-11 text-sm font-bold text-caneta underline-offset-4 hover:underline">
          Adicionar tópico
        </button>
      </div>
    </section>
  );
}
