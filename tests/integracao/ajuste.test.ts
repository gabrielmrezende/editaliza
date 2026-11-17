import { describe, expect, it } from 'vitest';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';
import type { DisciplinaPlano, MinutosPorDia } from '@/lib/dominio/tipos';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { gerarPlano } from '@/lib/plano/gerar';

const { AcompanhamentoError } = await import('@/lib/acompanhamento/servico');
const { ajustarAgora, ajustarSeVencido, marcarResumoVisto, ultimoAjusteNaoVisto } = await import(
  '@/lib/planos/ajuste-servico'
);

const AGORA = new Date('2026-11-16T15:00:00Z'); // 12h em São Paulo
const minutosDepois = (n: number) => new Date(AGORA.getTime() + n * 60_000);
const MINUTOS: MinutosPorDia = [0, 60, 60, 60, 60, 60, 60];

const CONTEUDO: DisciplinaPlano[] = [
  {
    id: 'd0',
    nome: 'Português',
    questoes: 20,
    pontos: null,
    nivel: 'basico',
    topicos: [
      { id: 'd0-t0', nome: 'Crase' },
      { id: 'd0-t1', nome: 'Pontuação' },
    ],
  },
  { id: 'd1', nome: 'Direito', questoes: 10, pontos: null, nivel: 'basico', topicos: [{ id: 'd1-t0', nome: 'Atos' }] },
];

/** Plano ativo (ciclo) criado em `criadoEm`, como se gerado naquele dia. */
async function criarPlano(userId: string, criadoEm = '2026-11-08T15:00:00Z'): Promise<string> {
  const gerado = gerarPlano({
    disciplinas: CONTEUDO,
    dataProva: null,
    hoje: criadoEm.slice(0, 10),
    minutosPorDia: MINUTOS,
    concluidos: [],
    pesosInformados: true,
  });
  const { data, error } = await admin()
    .from('planos')
    .insert({ user_id: userId, ativo: true, minutos_por_dia: MINUTOS, conteudo: CONTEUDO, gerado, created_at: criadoEm })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Sessão de questões com acerto baixo (3 de 15 = 20%) em Português. */
async function sessaoDeBaixoAcerto(userId: string, planoId: string) {
  const { error } = await admin().from('sessoes_estudo').insert({
    user_id: userId,
    plano_id: planoId,
    data: '2026-11-12',
    disciplina_id: 'd0',
    disciplina_nome: 'Português',
    minutos: 40,
    acertos: 3,
    erros: 12,
    tipo: 'questoes',
    origem: 'manual',
  });
  if (error) throw error;
}

async function novoAluno() {
  const u = await criarUsuarioTeste(emailUnico('ajuste'));
  const planoId = await criarPlano(u.id);
  await sessaoDeBaixoAcerto(u.id, planoId);
  return { ...u, planoId };
}

async function ajustesDe(planoId: string) {
  const { data, error } = await admin().from('ajustes_plano').select('*').eq('plano_id', planoId);
  if (error) throw error;
  return data;
}

async function esperarErro(p: Promise<unknown>, status: number, mensagem?: string) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(AcompanhamentoError);
  expect((erro as InstanceType<typeof AcompanhamentoError>).status).toBe(status);
  if (mensagem) expect((erro as Error).message).toBe(mensagem);
}

describe('ajuste semanal (serviço)', () => {
  it('plano vencido é ajustado uma vez: fator gravado, resumo com prioridade; de novo não ajusta', async () => {
    const a = await novoAluno();
    expect(await ajustarSeVencido(a.id, AGORA)).toBe(true);

    const { data: plano, error } = await admin()
      .from('planos')
      .select('ajustes, ajustado_em, ciclo_inicio, gerado')
      .eq('id', a.planoId)
      .single();
    if (error) throw error;
    expect(plano.ajustes).toEqual({ d0: 1.25 });
    expect(new Date(plano.ajustado_em as string).toISOString()).toBe(AGORA.toISOString());
    expect(plano.ciclo_inicio).not.toBeNull();

    const ajustes = await ajustesDe(a.planoId);
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0].multiplicadores).toEqual({ final: { d0: 1.25 }, acerto: { d0: 1.25 } });
    expect(ajustes[0].janela_inicio).toBe('2026-11-09');
    expect(ajustes[0].janela_fim).toBe('2026-11-15');
    expect(ajustes[0].resumo).toContainEqual(
      expect.objectContaining({ tipo: 'prioridade', disciplinaId: 'd0', direcao: 'sobe', percentual: 20, questoes: 15 }),
    );
    expect(ajustes[0].gerado_anterior.modo).toBe('ciclo');

    expect(await ajustarSeVencido(a.id, minutosDepois(5))).toBe(false);
    expect(await ajustesDe(a.planoId)).toHaveLength(1);
  });

  it('o próximo ajuste compara com o fator de acerto vigente (sem repetir "ganhou prioridade")', async () => {
    const a = await novoAluno();
    expect(await ajustarSeVencido(a.id, AGORA)).toBe(true);
    const seteDias = new Date(AGORA.getTime() + 7 * 86_400_000);
    expect(await ajustarSeVencido(a.id, seteDias)).toBe(true);
    const { data, error } = await admin()
      .from('ajustes_plano')
      .select('resumo')
      .eq('plano_id', a.planoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    expect((data.resumo as { tipo: string }[]).some((i) => i.tipo === 'prioridade')).toBe(false);
  });

  it('duas aberturas ao mesmo tempo num plano vencido gravam um único ajuste, sem erro', async () => {
    const a = await novoAluno();
    const resultados = await Promise.all([ajustarSeVencido(a.id, AGORA), ajustarSeVencido(a.id, AGORA)]);
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(await ajustesDe(a.planoId)).toHaveLength(1);
  });

  it('plano criado há menos de 7 dias não é ajustado; sem plano ativo devolve false', async () => {
    const u = await criarUsuarioTeste(emailUnico('ajuste'));
    expect(await ajustarSeVencido(u.id, AGORA)).toBe(false);
    const planoId = await criarPlano(u.id, '2026-11-10T15:00:00Z');
    expect(await ajustarSeVencido(u.id, AGORA)).toBe(false);
    expect(await ajustesDe(planoId)).toHaveLength(0);
  });

  it('"Ajustar agora": no máximo 1 por 60 minutos (429 com a hora de São Paulo)', async () => {
    const a = await novoAluno();
    const id = await ajustarAgora(a.id, a.planoId, AGORA);
    expect(typeof id).toBe('string');
    await esperarErro(
      ajustarAgora(a.id, a.planoId, minutosDepois(10)),
      429,
      'Você ajustou há pouco. Tente de novo depois das 13:00.',
    );
    await ajustarAgora(a.id, a.planoId, minutosDepois(60));
    expect(await ajustesDe(a.planoId)).toHaveLength(2);
  });

  it('"Ajustar agora" no plano de outro usuário → 404; sem plano ativo → 409', async () => {
    const a = await novoAluno();
    const outro = await novoAluno();
    await esperarErro(ajustarAgora(outro.id, a.planoId, AGORA), 404);
    const semPlano = await criarUsuarioTeste(emailUnico('ajuste'));
    await esperarErro(ajustarAgora(semPlano.id, a.planoId, AGORA), 409);
    await esperarErro(ajustarAgora(a.id, 'nao-e-uuid', AGORA), 404);
    expect(await ajustesDe(a.planoId)).toHaveLength(0);
  });

  it('o resumo aparece até ser marcado como visto', async () => {
    const a = await novoAluno();
    expect(await ultimoAjusteNaoVisto(a.id, a.planoId)).toBeNull();
    await ajustarSeVencido(a.id, AGORA);
    const visivel = await ultimoAjusteNaoVisto(a.id, a.planoId);
    expect(visivel).not.toBeNull();
    expect(visivel!.criadoEm).toBe(hojeEmSaoPaulo());
    expect(visivel!.resumo.some((i) => i.tipo === 'prioridade')).toBe(true);

    const outro = await novoAluno();
    expect(await ultimoAjusteNaoVisto(outro.id, a.planoId)).toBeNull();
    await esperarErro(marcarResumoVisto(outro.id, a.planoId, visivel!.id), 404);

    await marcarResumoVisto(a.id, a.planoId, visivel!.id);
    expect(await ultimoAjusteNaoVisto(a.id, a.planoId)).toBeNull();
  });
});
