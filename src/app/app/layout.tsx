import { Suspense } from 'react';
import { exigirUsuario } from '@/lib/supabase/servidor';

async function Protegido({ children }: { children: React.ReactNode }) {
  await exigirUsuario();
  return <>{children}</>;
}

/** Tudo sob /app exige login. A leitura da sessão fica dentro do Suspense (Cache Components). */
export default function LayoutApp({ children }: LayoutProps<'/app'>) {
  return (
    <Suspense fallback={<p className="p-5 text-sm text-texto-suave">Carregando…</p>}>
      <Protegido>{children}</Protegido>
    </Suspense>
  );
}
