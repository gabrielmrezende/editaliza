import 'server-only';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/** Cliente Supabase do servidor, autenticado pelos cookies da requisição. */
export async function criarClienteServidor(): Promise<SupabaseClient> {
  const armazem = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => armazem.getAll(),
        setAll(lista) {
          try {
            for (const { name, value, options } of lista) armazem.set(name, value, options);
          } catch {
            // Server Components não podem gravar cookies; o proxy renova a sessão.
          }
        },
      },
    },
  );
}

/** Usuário logado (validado no Auth) ou redireciona para /entrar. Chamar dentro de <Suspense>. */
export async function exigirUsuario(): Promise<User> {
  // A sessão é sempre dado de request (getUser usa Date.now e rede): fora do prerender.
  await connection();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/entrar');
  return data.user;
}
