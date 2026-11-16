/** fetch JSON com a mensagem de erro do servidor (campo `erro`) já extraída. */
export async function pedir<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; status: number; dados: T } | { ok: false; status: number; erro: string }> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    return { ok: false, status: 0, erro: 'Sem conexão com o servidor. Confira sua internet e tente de novo.' };
  }
  const corpo = await resp.json().catch(() => null);
  if (resp.ok) return { ok: true, status: resp.status, dados: corpo as T };
  const erro =
    resp.status === 401
      ? 'Sua sessão expirou. Entre de novo para continuar.'
      : (corpo?.erro as string | undefined) ?? 'Algo deu errado. Tente de novo.';
  return { ok: false, status: resp.status, erro };
}
