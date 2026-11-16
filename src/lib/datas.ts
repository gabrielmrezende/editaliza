/** Datas de calendário (aaaa-mm-dd) no fuso de Brasília, usado em todo o app. */
export const FUSO = 'America/Sao_Paulo';

const formatoIso = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO });

/** Hoje (aaaa-mm-dd) em São Paulo. */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return formatoIso.format(agora);
}

const MS_DIA = 86_400_000;
const paraMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

export function somarDias(iso: string, n: number): string {
  return new Date(paraMs(iso) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Dias de calendário de `de` até `ate` (positivo se `ate` é depois). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((paraMs(ate) - paraMs(de)) / MS_DIA);
}

/** Dia da semana (0 = domingo) de uma data aaaa-mm-dd. */
export function diaDaSemana(iso: string): number {
  return new Date(paraMs(iso)).getUTCDay();
}

/** "segunda, 16 de novembro" etc. (a data é de calendário: formata em UTC para não deslocar). */
export function dataPorExtenso(iso: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...opcoes }).format(new Date(paraMs(iso)));
}
