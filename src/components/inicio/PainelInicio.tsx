'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { indicesDasMaterias } from '@/components/cores';
import { RegistroManual } from '@/components/estudo/FormularioSessao';
import { RegistroRapido } from '@/components/estudo/RegistroRapido';
import { ResumoAjuste, type AjusteNaoVisto } from '@/components/plano/ResumoAjuste';
import { RevisoesHoje } from '@/components/plano/RevisoesHoje';
import { useRevisoes } from '@/components/revisoes/useRevisoes';
import { dataPorExtenso, diasEntre } from '@/lib/datas';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { montarFila } from '@/lib/plano/fila';
import { Calendario } from './Calendario';
import { CartaoProximoBloco } from './CartaoProximoBloco';
import { MeuProgresso } from './MeuProgresso';
import { ProximosBlocos } from './ProximosBlocos';

export interface PropsInicio {
  planoId: string;
  userId: string;
  hoje: string;
  /** Mês do calendário (aaaa-mm), de `?mes=`. */
  mes: string;
  titulo: string;
  origem: string | null;
  dataProva: string | null;
  disciplinas: DisciplinaPlano[];
  gerado: PlanoGerado;
  filaDesde: string | null;
  /** Posição na fila, como está no servidor. */
  posicao: number;
  concluidos: string[];
  /** Revisões do plano (todas); o Início mostra as de hoje e as atrasadas. */
  revisoes: Revisao[];
  /** Sessões do plano do começo da semana (ou da grade do mês, se antes) até hoje (ou o fim da grade). */
  sessoes: Sessao[];
  minutosPorDia: number[];
  iniciarAoAbrir: boolean;
  ajusteNaoVisto: AjusteNaoVisto | null;
  /** Dia (aaaa-mm-dd) do último ajuste; null se nunca houve. */
  ultimoAjuste: string | null;
}

/** Início: o próximo bloco (com cronômetro), o progresso, os próximos blocos, as revisões e o registro avulso. */
export function PainelInicio(p: PropsInicio) {
  const router = useRouter();
  const [atualizando, iniciarAtualizacao] = useTransition();
  const fila = useMemo(() => montarFila(p.gerado, p.filaDesde), [p.gerado, p.filaDesde]);
  const concluidos = useMemo(() => new Set(p.concluidos), [p.concluidos]);
  const indices = useMemo(() => indicesDasMaterias(p.disciplinas), [p.disciplinas]);
  // Um só estado de revisões para "Revisões de hoje" e o calendário: concluir num aparece no outro.
  const revisoes = useRevisoes(p.revisoes);
  const [origemRevisao, setOrigemRevisao] = useState<'hoje' | 'calendario'>('hoje');
  const concluirRevisao = (origem: 'hoje' | 'calendario') => (id: string, concluida: boolean) => {
    setOrigemRevisao(origem);
    revisoes.concluir(id, concluida);
  };
  // "Revisões de hoje": as pendentes até hoje ao abrir (concluídas agora ficam, marcadas, para desfazer).
  const idsDeHoje = useMemo(
    () => new Set(p.revisoes.filter((r) => !r.concluidaEm && r.dataRevisao <= p.hoje).map((r) => r.id)),
    [p.revisoes, p.hoje],
  );
  const [anuncioAjuste, setAnuncioAjuste] = useState('');

  // Posição local logo depois de concluir/voltar (para a transição), só até o servidor responder:
  // sai quando a posição do servidor muda e também quando o refresh termina (outra aba pode ter
  // levado a fila de volta ao valor que esta tela já tinha, e a local ficaria presa).
  const [posicaoVista, setPosicaoVista] = useState(p.posicao);
  const [posicaoLocal, setPosicaoLocal] = useState<number | null>(null);
  const [estavaAtualizando, setEstavaAtualizando] = useState(atualizando);
  if (p.posicao !== posicaoVista) {
    setPosicaoVista(p.posicao);
    setPosicaoLocal(null);
  }
  if (atualizando !== estavaAtualizando) {
    setEstavaAtualizando(atualizando);
    if (!atualizando) setPosicaoLocal(null);
  }
  const posicao = posicaoLocal ?? p.posicao;

  const faltam = p.dataProva ? diasEntre(p.hoje, p.dataProva) : null;
  const dataLonga = p.dataProva ? dataPorExtenso(p.dataProva, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* No celular o menu lateral (com o cartão do plano) não aparece: o plano se apresenta aqui. */}
      <div className="flex flex-col gap-0.5 lg:hidden">
        <p className="text-xl font-semibold leading-snug tracking-tight">{p.titulo}</p>
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
        aoAnunciar={setAnuncioAjuste}
      />
      <p role="status" className="sr-only">
        {anuncioAjuste}
      </p>
      <p role="status" className="sr-only">
        {revisoes.anuncio}
      </p>

      <CartaoProximoBloco
        planoId={p.planoId}
        userId={p.userId}
        fila={fila}
        posicao={posicao}
        disciplinas={p.disciplinas}
        concluidos={concluidos}
        indices={indices}
        iniciarAoAbrir={p.iniciarAoAbrir}
        atualizando={atualizando}
        aoMudarPosicao={setPosicaoLocal}
        aoAtualizar={() => iniciarAtualizacao(() => router.refresh())}
      />

      <MeuProgresso disciplinas={p.disciplinas} concluidos={p.concluidos} sessoes={p.sessoes} hoje={p.hoje} />

      {/* Tela larga: próximos blocos à esquerda, calendário do mês à direita. */}
      <div className="grid grid-cols-1 items-start gap-8 min-[1100px]:grid-cols-2 min-[1100px]:gap-x-8">
        <ProximosBlocos fila={fila} posicao={posicao} disciplinas={p.disciplinas} indices={indices} />
        <Calendario
          mes={p.mes}
          hoje={p.hoje}
          fila={fila}
          posicao={posicao}
          minutosPorDia={p.minutosPorDia}
          dataProva={p.gerado.modo === 'prazo' ? p.dataProva : null}
          sessoes={p.sessoes}
          revisoes={revisoes.revisoes}
          disciplinas={p.disciplinas}
          indices={indices}
          erroRevisao={origemRevisao === 'calendario' ? revisoes.erro : null}
          aoConcluirRevisao={concluirRevisao('calendario')}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-8 min-[1100px]:grid-cols-2 min-[1100px]:gap-x-8">
        <RevisoesHoje
          revisoes={revisoes.revisoes.filter((r) => idsDeHoje.has(r.id))}
          hoje={p.hoje}
          indices={indices}
          erro={origemRevisao === 'hoje' ? revisoes.erro : null}
          aoConcluir={concluirRevisao('hoje')}
        />
        <details className="group rounded-cartao border border-borda bg-superficie shadow-cartao">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-cartao px-4 text-xl font-semibold tracking-tight sm:px-5 [&::-webkit-details-marker]:hidden">
            Registrar sem cronômetro
            <ChevronDown aria-hidden className="size-5 shrink-0 text-texto-suave transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex flex-col gap-4 border-t border-borda p-3 sm:p-4">
            <RegistroManual planoId={p.planoId} disciplinas={p.disciplinas} hoje={p.hoje} />
            <RegistroRapido userId={p.userId} planoId={p.planoId} disciplinas={p.disciplinas} />
          </div>
        </details>
      </div>
    </div>
  );
}
