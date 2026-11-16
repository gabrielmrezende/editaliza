import type { Disciplina } from '@/lib/dominio/tipos';

/** Erro que impede avançar, ou null. */
export function validarConteudo(disciplinas: Disciplina[]): string | null {
  if (!disciplinas.some((d) => d.topicos.length > 0)) {
    return 'O plano precisa de ao menos 1 tópico. Adicione um tópico para continuar.';
  }
  if (disciplinas.some((d) => !d.nome.trim())) return 'Dê um nome a cada matéria.';
  if (disciplinas.some((d) => d.topicos.some((t) => !t.nome.trim()))) {
    return 'Há tópicos sem nome. Escreva o nome ou remova o tópico.';
  }
  return null;
}
