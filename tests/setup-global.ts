import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

export type ConfigSupabase = { url: string; anon: string; service: string };

declare module 'vitest' {
  export interface ProvidedContext {
    supabase: ConfigSupabase | null;
  }
}

/**
 * Lê a configuração do Supabase local uma vez só (antes, cada worker rodava `supabase status`,
 * lento e sujeito a estourar o tempo do beforeAll). Sem Supabase rodando, os testes de integração falham.
 */
export default function setup(project: TestProject) {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    try {
      const saida = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const env: Record<string, string> = {};
      for (const linha of saida.split(/\r?\n/)) {
        const m = linha.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
        if (m) env[m[1]] = m[2];
      }
      url ??= env.API_URL;
      anon ??= env.ANON_KEY;
      service ??= env.SERVICE_ROLE_KEY;
    } catch {
      // Supabase parado: os testes de unidade seguem; os de integração reclamam ao pedir a config.
    }
  }
  project.provide('supabase', url && anon && service ? { url, anon, service } : null);
}
