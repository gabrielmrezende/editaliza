import { Suspense } from 'react';
import { Carregando } from '@/components/Carregando';
import { ListaConteudos } from '@/components/conteudos/ListaConteudos';
import { planoAtivoOuRedireciona } from '@/lib/acompanhamento/consultas';
import { criarClienteServidor } from '@/lib/supabase/servidor';

// O título (h1 "Conteúdos") vem da barra do topo, pela lista de seções.
async function Conteudo() {
  const plano = await planoAtivoOuRedireciona();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from('topicos_concluidos').select('topico_id').eq('plano_id', plano.id);
  if (error) throw error;
  return (
    <ListaConteudos
      // Outro plano ("Novo plano"): estado do cliente do zero.
      key={plano.id}
      planoId={plano.id}
      disciplinas={plano.conteudo}
      avisos={plano.gerado.avisos}
      concluidos={(data ?? []).map((f) => f.topico_id as string)}
    />
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo />
    </Suspense>
  );
}
