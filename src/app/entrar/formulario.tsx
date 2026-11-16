'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { criarClienteNavegador } from '@/lib/supabase/navegador';

type Estado = 'parado' | 'enviando' | 'enviado' | 'erro';

export function FormularioEntrar() {
  const [email, setEmail] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');
  const falhouCallback = useSearchParams().get('erro') !== null;

  const urlCallback = () => `${window.location.origin}/auth/callback`;

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
      <p role="status">
        Enviamos um link de acesso para <strong>{email}</strong>. Abra o e-mail e clique no link
        para entrar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(falhouCallback || estado === 'erro') && (
        <p role="alert" className="text-red-700">
          Não foi possível entrar. Tente novamente.
        </p>
      )}
      <form onSubmit={enviarLink} className="flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={estado === 'enviando'}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          Receber link por e-mail
        </button>
      </form>
      <button
        type="button"
        onClick={entrarComGoogle}
        className="rounded border border-gray-300 px-4 py-2"
      >
        Entrar com Google
      </button>
    </div>
  );
}
