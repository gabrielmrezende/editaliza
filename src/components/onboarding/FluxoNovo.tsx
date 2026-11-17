'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConteudoCargo, Disciplina, MinutosPorDia } from '@/lib/dominio/tipos';
import { pedir } from './api';
import { DataProva } from './DataProva';
import { Disponibilidade, HORAS_PADRAO } from './Disponibilidade';
import { EnvioEdital } from './EnvioEdital';
import { EscolhaCargo } from './EscolhaCargo';
import { lerHoras } from './horas';
import { NivelMaterias } from './NivelMaterias';
import { RevisaoConteudo } from './RevisaoConteudo';
import type { EditalVisao, Niveis } from './tipos';

const ETAPAS = [
  { chave: 'envio', titulo: 'Envie o edital' },
  { chave: 'cargo', titulo: 'Qual é o seu cargo?' },
  { chave: 'revisao', titulo: 'Confira o conteúdo' },
  { chave: 'data', titulo: 'Quando é a prova?' },
  { chave: 'horas', titulo: 'Quanto tempo você tem?' },
  { chave: 'nivel', titulo: 'Qual é o seu nível?' },
] as const;
type Etapa = (typeof ETAPAS)[number]['chave'];

/** Onboarding em etapas no cliente; o plano é gerado e gravado no servidor (POST /api/planos). */
export function FluxoNovo() {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('envio');
  const [edital, setEdital] = useState<{ id: string; visao: EditalVisao } | null>(null);
  const [cargoId, setCargoId] = useState<string | null>(null);
  const [pesosInformados, setPesosInformados] = useState(true);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [data, setData] = useState({ data: '', semData: false });
  const [horas, setHoras] = useState<string[]>(HORAS_PADRAO);
  const [niveis, setNiveis] = useState<Niveis>({});
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);

  // A cada troca de etapa, o foco vai para o título (leitores de tela anunciam a nova etapa).
  const titulo = useRef<HTMLHeadingElement>(null);
  const etapaAnterior = useRef<Etapa>('envio');
  useEffect(() => {
    if (etapaAnterior.current === etapa) return;
    etapaAnterior.current = etapa;
    titulo.current?.focus();
  }, [etapa]);

  const indice = ETAPAS.findIndex((e) => e.chave === etapa);
  const ir = (e: Etapa) => {
    setEtapa(e);
    window.scrollTo({ top: 0 });
  };
  const comTopicos = disciplinas.filter((d) => d.topicos.length > 0);

  function aoEditalPronto(id: string, visao: EditalVisao) {
    setEdital({ id, visao });
    setData({ data: visao.resumo.dataProva ?? '', semData: false });
    ir('cargo');
  }

  function aoCargoPronto(id: string, conteudo: ConteudoCargo) {
    setCargoId(id);
    setPesosInformados(conteudo.pesosInformados);
    setDisciplinas(conteudo.disciplinas);
    setNiveis({});
    ir('revisao');
  }

  async function gerar() {
    if (!edital || !cargoId) return;
    setGerando(true);
    setErroGerar(null);
    const r = await pedir<{ planoId: string }>('/api/planos', {
      method: 'POST',
      body: JSON.stringify({
        editalId: edital.id,
        cargoId,
        dataProva: data.semData ? null : data.data,
        minutosPorDia: horas.map((h) => lerHoras(h) ?? 0) as MinutosPorDia,
        disciplinas: comTopicos.map((d) => ({
          ...d,
          nome: d.nome.trim(),
          topicos: d.topicos.map((t) => ({ ...t, nome: t.nome.trim() })),
          nivel: niveis[d.id] ?? 'basico',
        })),
      }),
    });
    if (r.ok) {
      router.push('/app/plano');
      return;
    }
    setGerando(false);
    setErroGerar(r.erro);
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Etapas" className="flex flex-col gap-2">
        <p className="text-sm text-texto-suave">
          Etapa {indice + 1} de {ETAPAS.length}
        </p>
        <ol className="grid grid-cols-6 gap-1.5">
          {ETAPAS.map((e, i) => (
            <li key={e.chave} aria-current={i === indice ? 'step' : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= indice ? 'bg-acao' : 'bg-borda'}`} />
              <span className="sr-only">
                {e.titulo}
                {i < indice ? ' (feita)' : ''}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <h1 ref={titulo} tabIndex={-1} className="text-3xl focus:outline-none font-bold leading-tight tracking-tight sm:text-4xl">{ETAPAS[indice].titulo}</h1>

      {etapa === 'envio' && <EnvioEdital aoPronto={aoEditalPronto} />}
      {etapa === 'cargo' && edital && (
        <EscolhaCargo editalId={edital.id} edital={edital.visao} aoPronto={aoCargoPronto} aoTrocarArquivo={() => ir('envio')} />
      )}
      {etapa === 'revisao' && (
        <RevisaoConteudo
          disciplinas={disciplinas}
          pesosInformados={pesosInformados}
          aoMudar={setDisciplinas}
          aoContinuar={() => ir('data')}
          aoVoltar={() => ir('cargo')}
        />
      )}
      {etapa === 'data' && (
        <DataProva
          data={data.data}
          semData={data.semData}
          dataDoEdital={edital?.visao.resumo.dataProva ?? null}
          aoMudar={setData}
          aoContinuar={() => ir('horas')}
          aoVoltar={() => ir('revisao')}
        />
      )}
      {etapa === 'horas' && (
        <Disponibilidade horas={horas} aoMudar={setHoras} aoContinuar={() => ir('nivel')} aoVoltar={() => ir('data')} />
      )}
      {etapa === 'nivel' && (
        <NivelMaterias
          disciplinas={comTopicos}
          niveis={niveis}
          erro={erroGerar}
          gerando={gerando}
          aoMudar={setNiveis}
          aoGerar={gerar}
          aoVoltar={() => ir('horas')}
        />
      )}
    </div>
  );
}
