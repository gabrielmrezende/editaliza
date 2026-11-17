'use client';

import { useState } from 'react';
import { dataPorExtenso, diaDaSemana, diasEntre } from '@/lib/datas';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { semana, tarefasDoDia } from '@/lib/plano/consultas';
import { indicesDasMaterias } from '../cores';
import { alerta } from '../estilos';
import { Avisos } from './Avisos';
import { Hoje, type ItemHoje } from './Hoje';
import { Progresso } from './Progresso';
import { ResumoAjuste, type AjusteNaoVisto } from './ResumoAjuste';
import { RevisoesHoje } from './RevisoesHoje';
import { Semana } from './Semana';
import { useMarcacoes } from './useMarcacoes';
import { associarSessoes, useRegistroRapido, type BlocoRapido, type SessaoRapida } from './useRegistroRapido';

type Props = {
  planoId: string;
  titulo: string;
  origem: string | null;
  dataProva: string | null;
  disciplinas: DisciplinaPlano[];
  gerado: PlanoGerado;
  concluidosIniciais: string[];
  hoje: string;
  minutosPorDia: number[];
  /** No ciclo: posição no ciclo, em minutos, pelo estudo registrado até ontem. */
  offsetCiclo: number;
  /** No ciclo: tópico de cada bloco de hoje (mesmo índice dos blocos), distinto por bloco e fixo no dia. */
  topicosDosBlocos: (string | null)[];
  /** Revisões pendentes que vencem hoje ou já venceram. */
  revisoesPendentes: Revisao[];
  /** Sessões de "Estudei" gravadas hoje neste plano, na ordem de gravação. */
  sessoesRapidasHoje: SessaoRapida[];
  /** Último ajuste semanal com o resumo ainda não fechado. */
  ajusteNaoVisto: AjusteNaoVisto | null;
  /** Dia (aaaa-mm-dd) do último ajuste; null se nunca houve. */
  ultimoAjuste: string | null;
};

/** Tela do plano: hoje, semana e progresso; marcar um tópico grava na hora (otimista). */
export function PainelPlano(p: Props) {
  const { concluidos, marcar, erro, anuncio } = useMarcacoes(p.planoId, p.concluidosIniciais);
  // Um só `role="status"` na tela: o último anúncio (registro rápido/ajuste, ou o da marcação).
  const [anuncioPainel, setAnuncioPainel] = useState('');
  const rapido = useRegistroRapido(p.planoId, p.sessoesRapidasHoje, setAnuncioPainel);
  const porId = new Map(p.disciplinas.map((d) => [d.id, d]));

  const blocos = tarefasDoDia(p.gerado, p.hoje, p.offsetCiclo, p.minutosPorDia[diaDaSemana(p.hoje)] ?? 0);
  const base = blocos.map((b, i) => {
    const d = porId.get(b.disciplinaId);
    // No ciclo o bloco não traz tópico: usa o tópico do dia da matéria, fixo (não pula ao marcar).
    const idTopico = b.topicoId ?? (b.tipo === 'estudo' ? (p.topicosDosBlocos[i] ?? null) : null);
    const topico = idTopico ? d?.topicos.find((t) => t.id === idTopico) : undefined;
    return { bloco: b, chave: `${i}-${b.disciplinaId}-${b.topicoId ?? ''}`, disciplina: d, topico: topico ?? null };
  });
  const rapidos: BlocoRapido[] = base.flatMap(({ bloco, chave, topico }) =>
    bloco.tipo === 'estudo' && topico
      ? [{ chave, disciplinaId: bloco.disciplinaId, topicoId: topico.id, nome: topico.nome, minutos: bloco.minutos }]
      : [],
  );
  const sessaoDoBloco = associarSessoes(rapidos, rapido.sessoes);
  const indices = indicesDasMaterias(p.disciplinas);
  const itens: ItemHoje[] = base.map(({ bloco, chave, disciplina, topico }) => ({
    chave,
    tipo: bloco.tipo,
    disciplinaId: bloco.disciplinaId,
    disciplina: disciplina?.nome ?? 'Revisão',
    indiceMateria: disciplina ? (indices.get(disciplina.id) ?? -1) : -1,
    topico,
    minutos: bloco.minutos,
    concluido: topico ? concluidos.has(topico.id) : false,
    sessaoRapidaId: sessaoDoBloco.get(chave) ?? null,
    registrando: rapido.pendentes.has(chave),
  }));
  const rapidoDe = (item: ItemHoje) => rapidos.find((r) => r.chave === item.chave);

  const faltam = p.dataProva ? diasEntre(p.hoje, p.dataProva) : null;
  const semTempo = p.gerado.avisos.some((a) => a.tipo === 'sem_tempo');

  const dataLonga = p.dataProva ? dataPorExtenso(p.dataProva, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* No celular o menu lateral (com o cartão do plano) não aparece: o plano se apresenta aqui. */}
      <div className="flex flex-col gap-0.5 lg:hidden">
        <p className="text-lg font-extrabold leading-snug tracking-tight">{p.titulo}</p>
        <p className="text-sm text-texto-suave">
          {p.origem && `${p.origem}. `}
          {dataLonga && faltam !== null
            ? faltam > 0
              ? `Prova em ${dataLonga}, faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'}.`
              : `A prova foi em ${dataLonga}.`
            : 'Sem data de prova: estudo em ciclo contínuo.'}
        </p>
      </div>

      <ResumoAjuste
        planoId={p.planoId}
        ajuste={p.ajusteNaoVisto}
        ultimoAjuste={p.ultimoAjuste}
        aoAnunciar={setAnuncioPainel}
      />
      <Avisos avisos={p.gerado.avisos} disciplinas={p.disciplinas} />
      {[erro, rapido.erro].map(
        (mensagem, i) =>
          mensagem && (
            <p key={i} role="alert" className={alerta}>
              {mensagem}
            </p>
          ),
      )}
      <p role="status" className="sr-only">
        {anuncioPainel || anuncio}
      </p>

      {/* Celular: Hoje, Revisões, Semana, Progresso. Tela larga: Progresso vira a coluna da direita. */}
      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-x-8">
        <div className="flex min-w-0 flex-col gap-8 xl:col-start-1 xl:row-start-1">
          <Hoje
            data={p.hoje}
            itens={itens}
            semTempo={semTempo}
            aoMarcar={(...args) => {
              setAnuncioPainel('');
              marcar(...args);
            }}
            aoEstudar={(item) => {
              const r = rapidoDe(item);
              if (r) void rapido.estudei(r);
            }}
            aoDesfazer={(item) => {
              const r = rapidoDe(item);
              if (r && item.sessaoRapidaId) void rapido.desfazer(r, item.sessaoRapidaId);
            }}
          />
          <RevisoesHoje pendentes={p.revisoesPendentes} hoje={p.hoje} indices={indices} />
          <Semana
            hoje={p.hoje}
            dias={semana(p.gerado, p.hoje, { offsetMinutos: p.offsetCiclo, minutosPorDia: p.minutosPorDia })}
            ciclo={p.gerado.modo === 'ciclo' ? p.gerado.ciclo : null}
            nomes={porId}
            indices={indices}
          />
        </div>
        <div className="min-w-0 xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1">
          <Progresso disciplinas={p.disciplinas} concluidos={concluidos} />
        </div>
      </div>
    </div>
  );
}
