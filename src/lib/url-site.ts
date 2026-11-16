/** URL pública do site (sem barra final), vinda só da configuração, nunca de headers da requisição. */
export function urlDoSite(): string {
  // Acesso literal: o Next só injeta NEXT_PUBLIC_* no bundle do navegador assim.
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SITE_URL não configurada (ex.: http://127.0.0.1:3000)');
  }
  return url.replace(/\/+$/, '');
}
