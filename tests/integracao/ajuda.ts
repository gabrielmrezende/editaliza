import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { inject } from 'vitest';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import type { ConfigSupabase } from '../setup-global';

/** Configuração lida uma vez no globalSetup (tests/setup-global.ts). */
function lerConfig(): ConfigSupabase {
  const cfg = inject('supabase');
  if (!cfg) throw new Error('Supabase local não está rodando (npx supabase start)');
  // criarClienteAdmin lê do process.env
  process.env.NEXT_PUBLIC_SUPABASE_URL = cfg.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = cfg.service;
  return cfg;
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
