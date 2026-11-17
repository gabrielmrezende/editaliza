import { Suspense } from 'react';
import { Carregando } from '@/components/Carregando';
import { PainelPlano } from '@/components/plano/PainelPlano';
import { diaDaSemana, hojeEmSaoPaulo } from '@/lib/datas';
import {
  minutosDeSessoesDoCiclo,
  planoAtivoOuRedireciona,
  revisoesDoPlano,
  sessoesRapidasDoDia,
} from '@/lib/acompanhamento/consultas';
import { tarefasDoDia } from '@/lib/plano/consultas';
import { ajustarSeVencido, ultimoAjusteNaoVisto } from '@/lib/planos/ajuste-servico';
import { minutosRegistradosNoCiclo, posicaoEmMinutos, topicosDosBlocos } from '@/lib/planos/ciclo';
import { criarClienteServidor, exigirUsuario } from '@/lib/supabase/servidor';

/** Ajusta o plano se a semana venceu; depois lê o plano ativo (RLS: só o dono) e os tópicos concluídos. */
async function Plano() {
  const usuario = await exigirUsuario();
  // Ajuste preguiçoso (≥ 7 dias): antes de ler, para a tela já mostrar o plano ajustado.
  await ajustarSeVencido(usuario.id);
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
  const [revisoes, sessoesRapidasHoje, ajusteNaoVisto] = await Promise.all([
    revisoesDoPlano(plano.id),
    sessoesRapidasDoDia(plano.id, hoje),
    ultimoAjusteNaoVisto(usuario.id, plano.id),
  ]);
  const pendentes = revisoes.filter((r) => !r.concluidaEm && r.dataRevisao <= hoje);
  const cargo = plano.edital_cargos;
  const origem = [cargo?.editais?.orgao, cargo?.editais?.ano].filter(Boolean).join(' ');
  return (
    <PainelPlano
      // Outro plano ("Novo plano"): estado do cliente do zero, sem herdar o do plano antigo.
      key={plano.id}
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
      sessoesRapidasHoje={sessoesRapidasHoje}
      ajusteNaoVisto={ajusteNaoVisto && { id: ajusteNaoVisto.id, resumo: ajusteNaoVisto.resumo }}
      ultimoAjuste={plano.ajustado_em ? hojeEmSaoPaulo(new Date(plano.ajustado_em)) : null}
    />
  );
}

export default function PaginaPlano() {
  return (
    <Suspense fallback={<Carregando texto="Carregando seu plano…" />}>
      <Plano />
    </Suspense>
  );
}
