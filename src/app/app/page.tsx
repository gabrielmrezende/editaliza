import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { criarClienteServidor, exigirUsuario } from '@/lib/supabase/servidor';

/** /app → /app/plano se houver plano ativo, senão /app/novo. */
async function Destino(): Promise<never> {
  const usuario = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from('planos')
    .select('id')
    .eq('user_id', usuario.id)
    .eq('ativo', true)
    .maybeSingle();
  redirect(data ? '/app/plano' : '/app/novo');
}

export default function PaginaApp() {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-texto-suave">Carregando…</p>}>
      <Destino />
    </Suspense>
  );
}
