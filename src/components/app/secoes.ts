import { ChartColumn, History, ListChecks, Repeat2, Timer, type LucideIcon } from 'lucide-react';

export interface Secao {
  href: string;
  rotulo: string;
  icone: LucideIcon;
}

/** Seções da área logada, na ordem do menu lateral e da barra inferior. */
export const SECOES: Secao[] = [
  { href: '/app/plano', rotulo: 'Plano', icone: ListChecks },
  { href: '/app/estudar', rotulo: 'Estudar', icone: Timer },
  { href: '/app/revisoes', rotulo: 'Revisões', icone: Repeat2 },
  { href: '/app/historico', rotulo: 'Histórico', icone: History },
  { href: '/app/relatorio', rotulo: 'Relatório', icone: ChartColumn },
];

/** Índice da seção do caminho atual (-1 se nenhuma). */
export const indiceDaSecao = (caminho: string): number =>
  SECOES.findIndex((s) => caminho === s.href || caminho.startsWith(`${s.href}/`));
