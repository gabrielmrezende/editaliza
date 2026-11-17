/** Classes compartilhadas (Tailwind) para manter botões, campos e superfícies iguais em todas as telas. */
export const botaoPrimario =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-linha bg-acao px-5 py-2.5 text-sm font-semibold text-na-acao transition-colors hover:bg-acao-hover disabled:cursor-not-allowed disabled:opacity-60';
export const botaoSecundario =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-linha border border-borda bg-superficie px-4 py-2.5 text-sm font-semibold text-texto-medio transition-colors hover:border-texto-suave hover:text-texto disabled:cursor-not-allowed disabled:opacity-60';
export const botaoTexto =
  'inline-flex min-h-11 items-center gap-1.5 rounded-linha px-2 text-sm font-semibold text-link underline-offset-4 hover:underline disabled:opacity-60';
export const campo =
  'w-full min-w-0 rounded-linha border border-borda bg-superficie-alt px-3 py-2 text-texto placeholder:text-texto-suave transition-colors hover:border-borda-forte focus:border-link focus:bg-superficie disabled:cursor-not-allowed disabled:opacity-70';
export const rotulo = 'text-sm text-texto-medio';
export const alerta = 'rounded-linha border-l-4 border-erro bg-erro-claro px-4 py-3 text-sm text-erro';
/** Superfície calma (cartão comum): branca, borda fina, raio de cartão. */
export const cartao = 'rounded-cartao border border-borda bg-superficie shadow-cartao';
/** Título de seção dentro das telas. */
export const tituloSecao = 'text-xl font-semibold tracking-tight text-texto';
/** Lista em linhas dentro de um cartão. */
export const listaLinhas = 'flex flex-col divide-y divide-borda rounded-cartao border border-borda bg-superficie shadow-cartao';
/** Estado vazio: convite a agir. */
export const vazio = 'rounded-cartao border border-dashed border-borda-forte bg-superficie px-5 py-6 text-texto-medio';

// Sobre o navy do cartão "Próximo bloco" (o único destaque forte do Início).
/** Ação principal dentro do destaque. */
export const botaoMint =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-linha bg-mint px-5 font-semibold text-na-mint transition-colors hover:bg-mint-forte disabled:cursor-not-allowed disabled:opacity-60';
export const botaoContornoNavy =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-linha border border-white/30 px-5 font-semibold text-na-navy transition-colors hover:border-white/60 hover:bg-white/8 disabled:cursor-not-allowed disabled:opacity-50';
export const botaoTextoNavy =
  'inline-flex min-h-12 items-center gap-1.5 rounded-linha px-3 text-na-navy-suave underline-offset-4 transition-colors hover:text-na-navy hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline disabled:hover:text-na-navy-suave';
export const campoNavy =
  'min-h-11 w-full min-w-0 rounded-linha border border-white/20 bg-white/8 px-3 py-2 text-na-navy tabular-nums placeholder:text-na-navy-suave/70 transition-colors hover:border-white/40 focus:border-mint focus:bg-white/12';
