'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { indicesDasMaterias } from '@/components/cores';
import { RegistroManual } from '@/components/estudo/FormularioSessao';
import { RegistroRapido } from '@/components/estudo/RegistroRapido';
import { ResumoAjuste, type AjusteNaoVisto } from '@/components/plano/ResumoAjuste';
import { RevisoesHoje } from '@/components/plano/RevisoesHoje';
import { dataPorExtenso, diasEntre } from '@/lib/datas';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { montarFila } from '@/lib/plano/fila';
import { CartaoProximoBloco } from './CartaoProximoBloco';
import { MeuProgresso } from './MeuProgresso';
import { ProximosBlocos } from './ProximosBlocos';

export interface PropsInicio {
  planoId: string;
  userId: string;
  hoje: string;
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
  /** Sessões do plano desde o começo da semana. */
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
  const pendentes = useMemo(
    () => p.revisoes.filter((r) => !r.concluidaEm && r.dataRevisao <= p.hoje),
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

      {/* Tela larga: a coluna da direita recebe o calendário do mês. */}
      <div className="grid grid-cols-1 items-start gap-8 min-[1100px]:gap-x-8">
        <ProximosBlocos fila={fila} posicao={posicao} disciplinas={p.disciplinas} indices={indices} />
      </div>

      <div className="grid grid-cols-1 items-start gap-8 min-[1100px]:grid-cols-2 min-[1100px]:gap-x-8">
        <RevisoesHoje pendentes={pendentes} hoje={p.hoje} indices={indices} />
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
