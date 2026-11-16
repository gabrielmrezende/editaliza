import { NextResponse } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/servidor';

/** Troca o código (link mágico ou Google) por sessão e segue para o destino. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // request.url pode vir com o host interno (localhost); usa o host que o navegador enviou.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const protocolo = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const origin = `${protocolo}://${host}`;
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
