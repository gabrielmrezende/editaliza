/** Converte o texto de horas ("2", "1,5", "1.5", "") em minutos inteiros; null se inválido. */
export function lerHoras(texto: string): number | null {
  const limpo = texto.trim().replace(/\s*h$/i, '');
  if (limpo === '') return 0;
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(limpo)) return null;
  const horas = Number(limpo.replace(',', '.'));
  if (horas > 24) return null;
  return Math.round(horas * 60);
}

/** Minutos → texto em horas no padrão brasileiro (90 → "1,5"). */
export function formatarHoras(minutos: number): string {
  const horas = Math.round((minutos / 60) * 100) / 100;
  return String(horas).replace('.', ',');
}
