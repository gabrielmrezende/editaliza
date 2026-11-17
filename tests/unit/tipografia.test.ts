import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Spec §6.4: corpo 16 px / linha 1,5, nada abaixo de 13 px, só os pesos 400 e 600.
const raiz = path.resolve(__dirname, '../..');
const arquivos = globSync('src/**/*.{ts,tsx}', { cwd: raiz }).map((relativo) => ({
  relativo: relativo.replaceAll('\\', '/'),
  linhas: readFileSync(path.join(raiz, relativo), 'utf8').split('\n'),
}));
const css = readFileSync(path.join(raiz, 'src/app/globals.css'), 'utf8');
const layout = readFileSync(path.join(raiz, 'src/app/layout.tsx'), 'utf8');

/** Lista `arquivo:linha  trecho` de cada linha em que `teste` acusa algo. */
function ocorrencias(teste: (linha: string) => string | null): string[] {
  const achados: string[] = [];
  for (const { relativo, linhas } of arquivos) {
    linhas.forEach((linha, i) => {
      const trecho = teste(linha);
      if (trecho) achados.push(`${relativo}:${i + 1}  ${trecho}`);
    });
  }
  return achados;
}

describe('tipografia', () => {
  it('só pesos 400 e 600 nas classes', () => {
    const achados = ocorrencias(
      (l) => l.match(/\bfont-(thin|extralight|light|medium|bold|extrabold|black)\b/)?.[0] ?? null,
    );
    expect(achados).toEqual([]);
  });

  it('nada abaixo de 13 px', () => {
    const achados = ocorrencias((l) => {
      if (/\btext-xs\b/.test(l)) return 'text-xs';
      for (const m of l.matchAll(/\btext-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
        const px = m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
        if (px < 13) return m[0];
      }
      return null;
    });
    expect(achados).toEqual([]);

    const pequenosCss = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .filter((m) => Number(m[1]) < 13)
      .map((m) => m[0]);
    expect(pequenosCss).toEqual([]);
  });

  it('a fonte carrega só 400 e 600', () => {
    expect(layout).toMatch(/weight:\s*\[\s*["']400["']\s*,\s*["']600["']\s*\]/);
  });

  it('CSS só com pesos 400 e 600', () => {
    const pesos = [...css.matchAll(/font-weight:\s*([^;}\s]+)/g)].map((m) => m[1]);
    expect(pesos.filter((p) => !['400', '600', 'normal'].includes(p))).toEqual([]);
    expect(css).toMatch(/(^|[\s,}])b\s*,\s*strong\s*\{[^}]*font-weight:\s*600/);
  });

  it('corpo com 16 px e linha 1,5', () => {
    const corpo = css.match(/(?:^|\n)body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(corpo).toMatch(/font-size:\s*(1rem|16px)\s*;/);
    expect(corpo).toMatch(/line-height:\s*1\.5\s*;/);
  });
});
