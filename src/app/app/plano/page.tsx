import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Marca } from '@/components/Marca';
import { PainelPlano } from '@/components/plano/PainelPlano';
import { diaDaSemana, hojeEmSaoPaulo } from '@/lib/datas';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { tarefasDoDia } from '@/lib/plano/consultas';
import { minutosNoCiclo, topicoDoCicloHoje } from '@/lib/planos/ciclo';
import { criarClienteServidor, exigirUsuario } from '@/lib/supabase/servidor';

type LinhaPlano = {
  id: string;
  data_prova: string | null;
  minutos_por_dia: number[];
  conteudo: DisciplinaPlano[];
  gerado: PlanoGerado;
  created_at: string;
  edital_cargos: { nome: string; editais: { orgao: string | null; ano: number | null } | null } | null;
};

/** Lê o plano ativo do usuário (RLS: só o dono) e os tópicos concluídos. */
async function Plano() {
  const usuario = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('planos')
    .select('id, data_prova, minutos_por_dia, conteudo, gerado, created_at, edital_cargos(nome, editais(orgao, ano))')
    .eq('user_id', usuario.id)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/app/novo');
  const plano = data as unknown as LinhaPlano;

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
  const offsetCiclo = minutosNoCiclo(hojeEmSaoPaulo(new Date(plano.created_at)), hoje, plano.minutos_por_dia);
  // No ciclo, cada matéria de hoje tem um tópico fixo no dia (para poder ser desmarcado).
  const topicosDoCiclo: Record<string, string | null> = {};
  if (plano.gerado.modo === 'ciclo') {
    const minutosHoje = plano.minutos_por_dia[diaDaSemana(hoje)] ?? 0;
    for (const bloco of tarefasDoDia(plano.gerado, hoje, offsetCiclo, minutosHoje)) {
      const disciplina = plano.conteudo.find((d) => d.id === bloco.disciplinaId);
      if (disciplina) topicosDoCiclo[disciplina.id] = topicoDoCicloHoje(disciplina, concluidos, hoje);
    }
  }
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
      topicosDoCiclo={topicosDoCiclo}
    />
  );
}

export default function PaginaPlano() {
  return (
    <div className="flex flex-1 flex-col bg-papel text-tinta">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5">
        <Marca />
        <Link href="/app/novo" className="min-h-11 content-center rounded-md px-2 text-sm font-bold text-caneta underline-offset-4 hover:underline">
          Novo plano
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <Suspense fallback={<p role="status">Carregando seu plano…</p>}>
          <Plano />
        </Suspense>
      </main>
    </div>
  );
}
