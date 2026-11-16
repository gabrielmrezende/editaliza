'use client';

import { useState } from 'react';
import { dataPorExtenso, diasEntre } from '@/lib/datas';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { semana, tarefasDoDia } from '@/lib/plano/consultas';
import { alerta } from '../estilos';
import { Avisos } from './Avisos';
import { Hoje, type ItemHoje } from './Hoje';
import { Progresso } from './Progresso';
import { Semana } from './Semana';

type Props = {
  planoId: string;
  titulo: string;
  origem: string | null;
  dataProva: string | null;
  disciplinas: DisciplinaPlano[];
  gerado: PlanoGerado;
  concluidosIniciais: string[];
  hoje: string;
  posicaoCiclo: number;
  /** Hoje tem horas de estudo? (no ciclo, dia sem horas fica livre). */
  diaDeEstudo: boolean;
};

/** Tela do plano: hoje, semana e progresso; marcar um tópico grava na hora (otimista). */
export function PainelPlano(p: Props) {
  const [concluidos, setConcluidos] = useState(() => new Set(p.concluidosIniciais));
  const [erro, setErro] = useState<string | null>(null);
  const porId = new Map(p.disciplinas.map((d) => [d.id, d]));

  async function marcar(topicoId: string, feito: boolean) {
    const aplicar = (marcado: boolean) =>
      setConcluidos((atual) => {
        const novo = new Set(atual);
        if (marcado) novo.add(topicoId);
        else novo.delete(topicoId);
        return novo;
      });
    setErro(null);
    aplicar(feito);
    const ok = await fetch(`/api/planos/${p.planoId}/topicos/${encodeURIComponent(topicoId)}`, {
      method: feito ? 'PUT' : 'DELETE',
    })
      .then((r) => r.ok)
      .catch(() => false);
    if (!ok) {
      aplicar(!feito);
      setErro('Não foi possível salvar a marcação. Confira sua internet e tente de novo.');
    }
  }

  const blocos = p.gerado.modo === 'ciclo' && !p.diaDeEstudo ? [] : tarefasDoDia(p.gerado, p.hoje, p.posicaoCiclo);
  const itens: ItemHoje[] = blocos.map((b, i) => {
    const d = porId.get(b.disciplinaId);
    // No ciclo o bloco não traz tópico: mostra o primeiro ainda pendente da matéria.
    const topico = b.topicoId
      ? d?.topicos.find((t) => t.id === b.topicoId)
      : b.tipo === 'estudo'
        ? d?.topicos.find((t) => !concluidos.has(t.id))
        : undefined;
    return {
      chave: `${i}-${b.disciplinaId}-${b.topicoId ?? ''}`,
      tipo: b.tipo,
      disciplina: d?.nome ?? 'Revisão',
      topico: topico ?? null,
      minutos: b.minutos,
      concluido: topico ? concluidos.has(topico.id) : false,
    };
  });

  const faltam = p.dataProva ? diasEntre(p.hoje, p.dataProva) : null;
  const semTempo = p.gerado.avisos.some((a) => a.tipo === 'sem_tempo');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        {p.origem && <p className="text-tinta-suave">{p.origem}</p>}
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{p.titulo}</h1>
        <p className="text-lg">
          {p.dataProva && faltam !== null
            ? faltam > 0
              ? `Prova em ${dataPorExtenso(p.dataProva, { day: 'numeric', month: 'long', year: 'numeric' })}. Faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
              : `A prova foi em ${dataPorExtenso(p.dataProva, { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Sem data de prova: você estuda em ciclo, uma matéria por dia.'}
        </p>
      </div>

      <Avisos avisos={p.gerado.avisos} disciplinas={p.disciplinas} />
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}

      {/* Celular: Hoje, Progresso, Semana. Tela larga: Progresso vira a coluna da direita. */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <Hoje data={p.hoje} itens={itens} semTempo={semTempo} aoMarcar={marcar} />
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Progresso disciplinas={p.disciplinas} concluidos={concluidos} />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <Semana
            hoje={p.hoje}
            dias={semana(p.gerado, p.hoje)}
            ciclo={p.gerado.modo === 'ciclo' ? p.gerado.ciclo : null}
            posicaoCiclo={p.posicaoCiclo}
            diaDeEstudo={p.diaDeEstudo}
            nomes={porId}
          />
        </div>
      </div>
    </div>
  );
}
