import { Suspense } from 'react';
import { Carregando } from '@/components/Carregando';
import { PainelInicio } from '@/components/inicio/PainelInicio';
import { planoAtivoOuRedireciona, revisoesDoPlano, sessoesDoPlano } from '@/lib/acompanhamento/consultas';
import { intervaloDoPeriodo } from '@/lib/acompanhamento/relatorio';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { gradeDoMes, mesValido } from '@/lib/plano/calendario';
import { ajustarSeVencido, ultimoAjusteNaoVisto } from '@/lib/planos/ajuste-servico';
import { criarClienteServidor, exigirUsuario } from '@/lib/supabase/servidor';

type Busca = Promise<Record<string, string | string[] | undefined>>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Ajusta o plano se a semana venceu; depois lê o plano ativo (RLS: só o dono), a fila, as revisões e
 * as sessões da semana e do mês do calendário (`?mes=aaaa-mm`).
 */
async function Inicio({ searchParams }: { searchParams: Busca }) {
  const usuario = await exigirUsuario();
  // Ajuste preguiçoso (≥ 7 dias): antes de ler, para a tela já mostrar o plano (e a fila) ajustados.
  await ajustarSeVencido(usuario.id);
  const [plano, busca] = await Promise.all([planoAtivoOuRedireciona(), searchParams]);
  const supabase = await criarClienteServidor();
  const hoje = hojeEmSaoPaulo();
  const inicioDaSemana = intervaloDoPeriodo('semana', hoje, hoje).inicio;
  const mes = mesValido(primeiro(busca.mes), hoje);
  const grade = gradeDoMes(mes);
  // A semana (Meu progresso) e a grade do mês (calendário): ISO compara como texto.
  const desde = grade[0] < inicioDaSemana ? grade[0] : inicioDaSemana;
  const ate = grade[grade.length - 1] > hoje ? grade[grade.length - 1] : hoje;

  const [feitos, revisoes, sessoes, ajusteNaoVisto] = await Promise.all([
    supabase.from('topicos_concluidos').select('topico_id').eq('plano_id', plano.id),
    revisoesDoPlano(plano.id),
    sessoesDoPlano(plano.id, desde, ate),
    ultimoAjusteNaoVisto(usuario.id, plano.id),
  ]);
  if (feitos.error) throw feitos.error;

  const cargo = plano.edital_cargos;
  const origem = [cargo?.editais?.orgao, cargo?.editais?.ano].filter(Boolean).join(' ');
  return (
    <PainelInicio
      // Outro plano ("Novo plano"): estado do cliente do zero, sem herdar o do plano antigo.
      key={plano.id}
      planoId={plano.id}
      userId={usuario.id}
      hoje={hoje}
      mes={mes}
      titulo={cargo?.nome ?? 'Seu plano'}
      origem={origem || null}
      dataProva={plano.data_prova}
      disciplinas={plano.conteudo}
      gerado={plano.gerado}
      filaDesde={plano.fila_desde}
      posicao={plano.fila_posicao}
      // A string do PostgREST, sem passar por Date: o servidor compara com o que leu do banco.
      ajustadoEm={plano.ajustado_em}
      concluidos={(feitos.data ?? []).map((f) => f.topico_id as string)}
      revisoes={revisoes}
      sessoes={sessoes}
      minutosPorDia={plano.minutos_por_dia}
      // Só `iniciar=1` conta: o cronômetro é do bloco atual (`?disciplina&topico` são ignorados).
      iniciarAoAbrir={primeiro(busca.iniciar) === '1'}
      ajusteNaoVisto={ajusteNaoVisto && { id: ajusteNaoVisto.id, resumo: ajusteNaoVisto.resumo }}
      ultimoAjuste={plano.ajustado_em ? hojeEmSaoPaulo(new Date(plano.ajustado_em)) : null}
    />
  );
}

export default function PaginaInicio({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<Carregando texto="Carregando seu plano…" />}>
      <Inicio searchParams={searchParams} />
    </Suspense>
  );
}
