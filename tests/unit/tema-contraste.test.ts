import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../src/app/globals.css'), 'utf8');

function paleta(seletor: RegExp): Record<string, string> {
  const bloco = css.match(seletor)?.[1];
  if (!bloco) throw new Error(`bloco não encontrado: ${seletor}`);
  const cores: Record<string, string> = {};
  for (const m of bloco.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) cores[m[1]] = m[2];
  return cores;
}

function luminancia(hex: string): number {
  const canais = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TOKENS = [
  'fundo', 'superficie', 'superficie-alt', 'texto', 'texto-medio', 'texto-suave', 'borda', 'borda-forte',
  'acao', 'acao-hover', 'na-acao', 'link', 'suave', 'navy', 'navy-forte', 'lateral', 'na-navy', 'na-navy-suave',
  'rust', 'na-rust', 'rust-texto', 'rust-claro', 'mint', 'mint-forte', 'na-mint', 'ok', 'ok-claro', 'aviso',
  'aviso-claro', 'erro', 'erro-claro',
];
/** Texto sobre fundo: todos os pares que aparecem nas telas. */
const PARES: [string, string][] = [
  ['texto', 'fundo'],
  ['texto', 'superficie'],
  ['texto', 'superficie-alt'],
  ['texto', 'suave'],
  ['texto-medio', 'superficie'],
  ['texto-medio', 'superficie-alt'],
  ['texto-suave', 'superficie'],
  ['texto-suave', 'fundo'],
  ['texto-suave', 'superficie-alt'],
  ['link', 'superficie'],
  ['link', 'superficie-alt'],
  ['na-acao', 'acao'],
  ['na-acao', 'acao-hover'],
  // Texto sobre navy (menu lateral e cartão "Agora").
  ['na-navy', 'navy'],
  ['na-navy', 'lateral'],
  ['na-navy-suave', 'navy'],
  ['na-navy-suave', 'lateral'],
  ['mint', 'navy'],
  // Texto sobre mint ("Iniciar") e sobre rust (seção ativa).
  ['na-mint', 'mint'],
  ['na-mint', 'mint-forte'],
  ['na-rust', 'rust'],
  ['rust-texto', 'superficie'],
  ['rust-texto', 'rust-claro'],
  ['ok', 'superficie'],
  ['ok', 'superficie-alt'],
  ['aviso', 'aviso-claro'],
  ['erro', 'erro-claro'],
];

const temas = {
  claro: paleta(/:root,\s*\[data-theme="light"\]\s*\{([^}]*)\}/),
  escuro: paleta(/\[data-theme="dark"\]\s*\{([^}]*)\}/),
};

describe.each(Object.entries(temas))('tema %s', (_nome, cores) => {
  it('define todos os tokens', () => {
    for (const t of TOKENS) expect(cores[t], t).toBeDefined();
  });

  it.each(PARES)('%s sobre %s tem contraste WCAG AA (>= 4,5)', (fg, bg) => {
    expect(contraste(cores[fg], cores[bg])).toBeGreaterThanOrEqual(4.5);
  });
});
