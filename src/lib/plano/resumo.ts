import { formatarMinutos } from '@/lib/formatar';
import type { ItemResumo } from './ajuste';

/** Frase de um item do resumo do ajuste semanal. */
export function textoDoResumo(item: ItemResumo): string {
  switch (item.tipo) {
    case 'horas': {
      const p = Math.round((100 * item.estudados) / item.planejados);
      const base = `Você estudou ${formatarMinutos(item.estudados)} de ${formatarMinutos(item.planejados)} planejadas (${p}%).`;
      return item.diasAteProva === null
        ? base
        : `${base} O conteúdo que ficou foi redistribuído nos ${item.diasAteProva} dias até a prova.`;
    }
    case 'sem_estudo':
      return 'Nenhum estudo registrado nos últimos 7 dias.';
    case 'fila_refeita':
      return 'A fila foi refeita com o que falta estudar.';
    case 'prioridade':
      if (item.direcao === 'normal') return `${item.nome} voltou à prioridade normal.`;
      return item.direcao === 'sobe'
        ? `${item.nome} ganhou prioridade: ${item.percentual}% de acerto em ${item.questoes} questões.`
        : `${item.nome} perdeu um pouco de prioridade: ${item.percentual}% de acerto em ${item.questoes} questões.`;
    case 'revisoes_atrasadas':
      return `${item.quantidade} revisões atrasadas em ${item.nome}: elas aparecem primeiro em Hoje.`;
    case 'nao_cabe':
      return item.agora === 0
        ? 'Todo o edital voltou a caber até a prova.'
        : `Agora ${item.agora} tópicos não cabem até a prova (antes: ${item.antes}).`;
    case 'em_dia':
      return 'Seu plano está em dia. Nada mudou.';
  }
}
