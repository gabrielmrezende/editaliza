'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { urlDoSite } from '@/lib/url-site';
import { criarClienteNavegador } from '@/lib/supabase/navegador';
import { MailCheck } from 'lucide-react';
import { alerta, botaoPrimario, botaoSecundario, campo, rotulo } from '@/components/estilos';

type Estado = 'parado' | 'enviando' | 'enviado' | 'erro';

export function FormularioEntrar() {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');
  const falhouCallback = useSearchParams().get('erro') !== null;

  const urlCallback = () => `${urlDoSite()}/auth/callback`;

  async function enviarLink(e: React.FormEvent) {
    e.preventDefault();
    setEstado('enviando');
    const { error } = await criarClienteNavegador().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: urlCallback() },
    });
    setEstado(error ? 'erro' : 'enviado');
  }

  async function entrarComGoogle() {
    const { error } = await criarClienteNavegador().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: urlCallback() },
    });
    if (error) setEstado('erro');
  }

  if (estado === 'enviado') {
    return (
      <div className="flex gap-3 rounded-cartao border border-borda border-l-4 border-l-mint-forte bg-superficie p-4 shadow-cartao">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-ok" />
        <p role="status" className="text-sm text-texto-medio">
          Enviamos um link de acesso para <strong className="break-all text-texto">{email}</strong>. Abra o e-mail e
          clique no link para entrar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {(falhouCallback || estado === 'erro') && (
        <p role="alert" className={alerta}>
          Não foi possível entrar. Tente novamente.
        </p>
      )}
      <form onSubmit={enviarLink} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className={rotulo}>
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${campo} min-h-12`}
          />
        </div>
        <button type="submit" disabled={estado === 'enviando'} className={`${botaoPrimario} min-h-12 w-full`}>
          {estado === 'enviando' ? 'Enviando…' : 'Receber link por e-mail'}
        </button>
      </form>
      <div aria-hidden className="flex items-center gap-3 text-xs font-semibold text-texto-suave">
        <span className="h-px flex-1 bg-borda" />
        ou
        <span className="h-px flex-1 bg-borda" />
      </div>
      <button type="button" onClick={entrarComGoogle} className={`${botaoSecundario} min-h-12 w-full`}>
        Entrar com Google
      </button>
    </div>
  );
}
