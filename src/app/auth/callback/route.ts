import { NextResponse } from 'next/server';
import { urlDoSite } from '@/lib/url-site';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/** Troca o código (link mágico ou Google) por sessão e segue para o destino. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = urlDoSite();
  const code = searchParams.get('code');
  const proximo = searchParams.get('next') ?? '/app';
  // Só caminhos internos, para não virar redirecionamento aberto.
  const destino = proximo.startsWith('/') && !proximo.startsWith('//') ? proximo : '/app';

  if (code) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/entrar?erro=1`);
}
