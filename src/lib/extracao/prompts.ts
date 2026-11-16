const REGRAS_COMUNS = `Regras obrigatórias:
- Extraia SOMENTE o que está escrito no edital. Nunca invente, complete ou deduza informações.
- Mantenha os nomes exatamente como aparecem no edital.`;

export const PROMPT_LISTAR_CARGOS = `Você é um assistente que lê editais de concursos públicos brasileiros.
Leia o documento anexado e extraia: órgão, banca organizadora, ano, data da prova e a lista de todos os cargos oferecidos.

${REGRAS_COMUNS}
- Use null para banca, ano ou dataProva quando o edital não informar. A data da prova deve estar no formato aaaa-mm-dd.
- Liste cada cargo uma única vez, na ordem em que aparecem no edital.
- Se o documento NÃO for um edital de concurso ou processo seletivo, ou não houver nenhum cargo, devolva "cargos": [] (lista vazia).`;

export function promptExtrairConteudo(cargo: string): string {
  return `Você é um assistente que lê editais de concursos públicos brasileiros.
Leia o documento anexado e extraia o conteúdo programático APENAS do cargo "${cargo}": as disciplinas, o número de questões, os pontos e os tópicos de cada uma.

${REGRAS_COMUNS}
- Considere somente as disciplinas e tópicos que se aplicam ao cargo "${cargo}" (conteúdos comuns a todos os cargos também valem).
- Liste disciplinas e tópicos na MESMA ORDEM em que aparecem no edital.
- Cada tópico deve ser um item de estudo curto e autônomo; separe itens numerados ou separados por ponto e vírgula.
- Use null em "questoes" e "pontos" quando o edital não informar esses valores para a disciplina.
- "pesosInformados" é true somente se o edital informa questões ou pontos por disciplina.
- "tipoProva": multipla_escolha, certo_errado, discursiva ou mista, conforme o edital.`;
}
