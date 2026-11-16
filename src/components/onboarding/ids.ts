/**
 * Id novo e único no plano para o que o aluno acrescenta na revisão:
 * matérias viram `n{k}` e tópicos `{idDaMatéria}-n{k}` (ex.: `d0-n0`).
 */
export function novoId(prefixo: string, existentes: Set<string>): string {
  let k = 0;
  while (existentes.has(`${prefixo}n${k}`)) k++;
  return `${prefixo}n${k}`;
}
