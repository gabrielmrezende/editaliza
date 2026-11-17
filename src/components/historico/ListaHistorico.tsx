'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Confirmacao, Dialogo } from '@/components/Dialogo';
import { alerta, botaoSecundario, botaoTexto } from '@/components/estilos';
import { pedir } from '@/components/onboarding/api';
import { FormularioSessao, ROTULO_TIPO, type DadosSessao } from '@/components/estudo/FormularioSessao';
import { dataPorExtenso } from '@/lib/datas';
import type { OrigemSessao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';

const ROTULO_ORIGEM: Record<OrigemSessao, string> = {
  cronometro: 'Cronômetro',
  manual: 'Registro manual',
  rapido: 'Registro rápido',
};

const dataCurta = (iso: string) => dataPorExtenso(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });

/** "8 acertos, 2 erros (80%)"; null sem questões. */
function questoes(s: Sessao): string | null {
  const total = s.acertos + s.erros;
  if (total === 0) return null;
  const pct = Math.round((100 * s.acertos) / total);
  return `${s.acertos} ${s.acertos === 1 ? 'acerto' : 'acertos'}, ${s.erros} ${s.erros === 1 ? 'erro' : 'erros'} (${pct}%)`;
}

/**
 * Matérias que o formulário de edição oferece. Sessão do plano ativo com matéria/tópico que ainda
 * existem: o conteúdo do plano (dá para trocar o tópico). Senão (plano antigo, matéria ou tópico que
 * saiu do plano): só o nome guardado, com matéria e tópico travados.
 */
function conteudoDaEdicao(s: Sessao, planoId: string | null, disciplinas: DisciplinaPlano[]) {
  const disciplina = s.planoId === planoId ? disciplinas.find((d) => d.id === s.disciplinaId) : undefined;
  const topicoExiste = !s.topicoId || disciplina?.topicos.some((t) => t.id === s.topicoId);
  if (disciplina && topicoExiste) return { disciplinas, travado: false };
  const guardada: DisciplinaPlano = {
    id: s.disciplinaId,
    nome: s.disciplinaNome,
    questoes: null,
    pontos: null,
    nivel: disciplina?.nivel ?? 'basico', // não aparece no formulário
    topicos: s.topicoId ? [{ id: s.topicoId, nome: s.topicoNome ?? 'Tópico' }] : [],
  };
  return { disciplinas: [guardada], travado: true };
}

/** Sessões do histórico, cada uma com Editar (diálogo) e Excluir (confirmação). */
export function ListaHistorico({
  sessoes,
  planoId,
  disciplinas,
  hoje,
}: {
  sessoes: Sessao[];
  /** Plano ativo (null se o aluno não tem): só sessões dele podem trocar de tópico. */
  planoId: string | null;
  disciplinas: DisciplinaPlano[];
  hoje: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<Sessao | null>(null);
  const [excluindo, setExcluindo] = useState<Sessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  async function salvar(s: Sessao, dados: DadosSessao, travado: boolean) {
    const r = await pedir<null>(`/api/sessoes/${encodeURIComponent(s.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: dados.data,
        ...(travado ? {} : { topicoId: dados.topicoId }),
        minutos: dados.minutos,
        acertos: dados.acertos,
        erros: dados.erros,
        tipo: dados.tipo,
        observacao: dados.observacao,
      }),
    });
    if (!r.ok) throw new Error(r.erro);
    setEditando(null);
    setAnuncio('Sessão atualizada.');
    router.refresh();
  }

  async function excluir(s: Sessao) {
    setExcluindo(null);
    setErro(null);
    setAnuncio('');
    const r = await pedir<null>(`/api/sessoes/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) {
      setErro(r.erro);
      return;
    }
    setAnuncio('Sessão excluída.');
    router.refresh();
  }

  const edicao = editando ? conteudoDaEdicao(editando, planoId, disciplinas) : null;

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <p role="status" className="sr-only">
        {anuncio}
      </p>
      <ul aria-label="Sessões" className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
        {sessoes.map((s) => {
          const q = questoes(s);
          const detalhes = [formatarMinutos(s.minutos), q, s.tipo ? ROTULO_TIPO[s.tipo] : null, ROTULO_ORIGEM[s.origem]];
          return (
            <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm text-tinta-suave">{dataCurta(s.data)}</p>
                <p className="text-sm font-bold text-caneta">{s.disciplinaNome}</p>
                <p className="font-bold leading-snug">{s.topicoNome ?? 'Sem tópico específico'}</p>
                <p className="text-sm text-tinta-suave">{detalhes.filter(Boolean).join(' · ')}</p>
                {s.observacao && <p className="text-sm break-words whitespace-pre-line">{s.observacao}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  className={botaoSecundario}
                  aria-label={`Editar a sessão de ${s.disciplinaNome} em ${dataCurta(s.data)}`}
                  onClick={() => {
                    setErro(null);
                    setAnuncio('');
                    setEditando(s);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={botaoTexto}
                  aria-label={`Excluir a sessão de ${s.disciplinaNome} em ${dataCurta(s.data)}`}
                  onClick={() => setExcluindo(s)}
                >
                  Excluir
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialogo aberto={editando !== null} titulo="Editar sessão" aoFechar={() => setEditando(null)} largo>
        {editando && edicao && (
          <div className="mt-4 flex flex-col gap-3">
            {edicao.travado && (
              <p className="text-sm text-tinta-suave">
                Esta sessão é de um plano antigo ou de uma matéria que saiu do plano: dá para mudar data, tempo,
                questões, tipo e observação.
              </p>
            )}
            <FormularioSessao
              key={editando.id}
              modo="edicao"
              disciplinas={edicao.disciplinas}
              travarTopico={edicao.travado}
              hoje={hoje}
              inicial={{
                data: editando.data,
                disciplinaId: editando.disciplinaId,
                topicoId: editando.topicoId ?? '',
                minutos: String(editando.minutos),
                acertos: editando.acertos ? String(editando.acertos) : '',
                erros: editando.erros ? String(editando.erros) : '',
                tipo: editando.tipo ?? '',
                observacao: editando.observacao ?? '',
              }}
              aoSalvar={(dados) => salvar(editando, dados, edicao.travado)}
              acoes={
                <button type="button" className={botaoSecundario} onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              }
            />
          </div>
        )}
      </Dialogo>

      <Confirmacao
        aberto={excluindo !== null}
        titulo="Excluir esta sessão?"
        confirmar="Excluir"
        cancelar="Cancelar"
        aoConfirmar={() => excluindo && excluir(excluindo)}
        aoCancelar={() => setExcluindo(null)}
      >
        As revisões pendentes criadas por ela também serão apagadas.
      </Confirmacao>
    </div>
  );
}
