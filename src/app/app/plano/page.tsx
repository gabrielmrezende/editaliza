import { Suspense } from 'react';
import { MolduraApp } from '@/components/app/MolduraApp';
import { PainelPlano } from '@/components/plano/PainelPlano';
import { diaDaSemana, hojeEmSaoPaulo } from '@/lib/datas';
import { minutosDeSessoesDoCiclo, planoAtivoOuRedireciona, revisoesDoPlano } from '@/lib/acompanhamento/consultas';
import { tarefasDoDia } from '@/lib/plano/consultas';
import { minutosRegistradosNoCiclo, posicaoEmMinutos, topicosDosBlocos } from '@/lib/planos/ciclo';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/** Lê o plano ativo do usuário (RLS: só o dono) e os tópicos concluídos. */
async function Plano() {
  const plano = await planoAtivoOuRedireciona();
  const supabase = await criarClienteServidor();

  const { data: feitos, error: errFeitos } = await supabase
    .from('topicos_concluidos')
    .select('topico_id, concluido_em')
    .eq('plano_id', plano.id);
  if (errFeitos) throw errFeitos;

  const hoje = hojeEmSaoPaulo();
  const concluidos = (feitos ?? []).map((f) => ({
    topicoId: f.topico_id as string,
    dia: hojeEmSaoPaulo(new Date(f.concluido_em as string)),
  }));
  let offsetCiclo = 0;
  let topicosHoje: (string | null)[] = [];
  if (plano.gerado.modo === 'ciclo') {
    // O ciclo avança pelo estudo registrado (sessões em [desde, hoje)), não pelo calendário.
    const desde = hojeEmSaoPaulo(new Date(plano.ajustado_em ?? plano.created_at));
    const sessoes = await minutosDeSessoesDoCiclo(plano.id, desde, hoje);
    const registrados = minutosRegistradosNoCiclo(sessoes, desde, hoje);
    offsetCiclo = posicaoEmMinutos(plano.gerado.ciclo, plano.ciclo_inicio, registrados);
    const minutosHoje = plano.minutos_por_dia[diaDaSemana(hoje)] ?? 0;
    topicosHoje = topicosDosBlocos(tarefasDoDia(plano.gerado, hoje, offsetCiclo, minutosHoje), plano.conteudo, concluidos, hoje);
  }
  const pendentes = (await revisoesDoPlano(plano.id)).filter((r) => !r.concluidaEm && r.dataRevisao <= hoje);
  const cargo = plano.edital_cargos;
  const origem = [cargo?.editais?.orgao, cargo?.editais?.ano].filter(Boolean).join(' ');
  return (
    <PainelPlano
      planoId={plano.id}
      titulo={cargo?.nome ?? 'Seu plano'}
      origem={origem || null}
      dataProva={plano.data_prova}
      disciplinas={plano.conteudo}
      gerado={plano.gerado}
      concluidosIniciais={concluidos.map((c) => c.topicoId)}
      hoje={hoje}
      minutosPorDia={plano.minutos_por_dia}
      offsetCiclo={offsetCiclo}
      topicosDosBlocos={topicosHoje}
      revisoesPendentes={pendentes}
    />
  );
}

export default function PaginaPlano() {
  return (
    <MolduraApp>
      <Suspense fallback={<p role="status">Carregando seu plano…</p>}>
        <Plano />
      </Suspense>
    </MolduraApp>
  );
}
