import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { criarClienteAdmin } from '@/lib/supabase/admin';

type Config = { url: string; anon: string; service: string };

let cache: Config | undefined;

function lerConfig(): Config {
  if (cache) return cache;
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    const saida = execSync('npx supabase status -o env', { encoding: 'utf8' });
    const env: Record<string, string> = {};
    for (const linha of saida.split(/\r?\n/)) {
      const m = linha.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
      if (m) env[m[1]] = m[2];
    }
    url ??= env.API_URL;
    anon ??= env.ANON_KEY;
    service ??= env.SERVICE_ROLE_KEY;
  }
  if (!url || !anon || !service) {
    throw new Error('Supabase local não está rodando (npx supabase start)');
  }
  cache = { url, anon, service };
  // criarClienteAdmin lê do process.env
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  return cache;
}

export function admin(): SupabaseClient {
  lerConfig();
  return criarClienteAdmin();
}

const SENHA = 'senha-de-teste-123';

/** Cria usuário confirmado via admin e devolve cliente autenticado como ele. */
export async function criarUsuarioTeste(
  email: string,
): Promise<{ id: string; cliente: SupabaseClient }> {
  const cfg = lerConfig();
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('falha ao criar usuário');
  const cliente = createClient(cfg.url, cfg.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: errLogin } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (errLogin) throw errLogin;
  return { id: data.user.id, cliente };
}

export const emailUnico = (prefixo: string) => `${prefixo}-${randomUUID()}@teste.local`;
