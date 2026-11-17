import { expect, test, type Page } from '@playwright/test';
import { abrirRegistroSemCronometro, criarPlano, registroRapido } from './ajuda';

const cartao = (page: Page) => page.getByRole('region', { name: 'Próximo bloco' });

test.describe('acompanhamento', () => {
  test.describe.configure({ timeout: 120_000 });

  test('cronômetro pausado continua pausado ao sair e voltar pela aba Revisões', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento' });
    const secoes = page.getByRole('navigation', { name: 'Seções' }).first();

    await page.goto('/app/plano?iniciar=1');
    await expect(cartao(page).getByRole('timer')).toHaveText('00:00:02');
    await cartao(page).getByRole('button', { name: 'Pausar' }).click();
    await expect(cartao(page).getByRole('button', { name: 'Retomar' })).toBeVisible();
    const pausado = await cartao(page).getByRole('timer').textContent();

    // O pedido "iniciar" já foi atendido: voltar ao Início pela aba não o repete.
    await secoes.getByRole('link', { name: 'Revisões' }).click();
    await expect(page).toHaveURL(/\/app\/revisoes$/);
    await secoes.getByRole('link', { name: 'Início' }).click();
    await expect(page).toHaveURL(/\/app\/plano$/);
    await expect(cartao(page).getByRole('button', { name: 'Retomar' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(cartao(page).getByRole('button', { name: 'Retomar' })).toBeVisible();
    await expect(cartao(page).getByRole('timer')).toHaveText(pausado!);
  });

  test('histórico edita e exclui', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento' });
    await page.goto('/app/historico');
    await expect(page.getByText('Nenhuma sessão registrada ainda.')).toBeVisible();

    await page.goto('/app/plano');
    await registroRapido(page, { materia: 'Raciocínio Lógico', topico: 'Sequências', minutos: '30' });
    await page.goto('/app/historico');
    const linhas = page.getByRole('list', { name: 'Sessões' }).getByRole('listitem');
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText('Registro rápido');

    // Página fora do intervalo e parâmetros inválidos não quebram a tela.
    await page.goto('/app/historico?pagina=999');
    await expect(page.getByText('Nenhuma sessão nesta página.')).toBeVisible();
    await page.goto('/app/historico?pagina=abc&de=ontem&ate=2026-02-31');
    await expect(linhas).toHaveCount(1);

    await linhas.first().getByRole('button', { name: 'Editar' }).click();
    const edicao = page.getByRole('dialog', { name: 'Editar sessão' });
    await expect(edicao).toBeVisible();
    await expect(edicao.getByLabel('Matéria')).toBeDisabled();
    await edicao.getByLabel('Minutos').fill('50');
    await edicao.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(edicao).toBeHidden();
    await expect(linhas.first()).toContainText('50 min');
    await page.reload();
    await expect(linhas.first()).toContainText('50 min');

    await linhas.first().getByRole('button', { name: 'Excluir' }).click();
    const confirmacao = page.getByRole('dialog', { name: 'Excluir esta sessão?' });
    await expect(confirmacao).toContainText(
      'As revisões pendentes dela saem da agenda, a não ser que outra sessão do mesmo tópico continue.',
    );
    await confirmacao.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Nenhuma sessão registrada ainda.')).toBeVisible();
  });

  test('relatório mostra o tempo, o acerto e o assunto a reforçar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento' });
    await page.goto('/app/relatorio');
    await expect(page.getByText('Nenhum estudo registrado neste período.')).toBeVisible();

    await page.goto('/app/plano');
    await abrirRegistroSemCronometro(page);
    const registro = page.getByRole('region', { name: 'Registrar sessão' });
    await registro.getByLabel('Matéria').selectOption({ index: 1 });
    await registro.getByLabel('Tópico').selectOption({ index: 1 });
    const topico = (await registro.getByLabel('Tópico').locator('option:checked').textContent())!.trim();
    await registro.getByLabel('Minutos').fill('45');
    await registro.getByLabel('Acertos').fill('4');
    await registro.getByLabel('Erros').fill('6');
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/sessoes')),
      registro.getByRole('button', { name: 'Salvar sessão' }).click(),
    ]);
    expect(resposta.status()).toBe(201);

    await page.goto('/app/relatorio?periodo=30dias');
    const resumo = page.getByRole('region', { name: 'Resumo do período' });
    await expect(resumo.getByText('45 min')).toBeVisible();
    await expect(resumo.getByText('40%')).toBeVisible();
    const reforcar = page.getByRole('region', { name: 'Assuntos para reforçar' });
    await expect(reforcar).toContainText(topico);
    await expect(reforcar).toContainText('40% de acerto em 10 questões');

    // Período desconhecido volta para a semana, sem quebrar.
    await page.goto('/app/relatorio?periodo=qualquer');
    await expect(page.getByRole('link', { name: 'Esta semana' })).toHaveAttribute('aria-current', 'page');
  });

  test('ajustar agora mostra resumo', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento' });
    const ajustar = page.getByRole('button', { name: 'Ajustar agora' });
    // No prazo o ajuste pode refazer a fila: pede confirmação antes; Cancelar não ajusta.
    const confirmacao = page.getByRole('dialog', { name: 'Ajustar o plano agora?' });
    await ajustar.click();
    await expect(confirmacao).toContainText('A fila recomeça com o que falta estudar.');
    await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirmacao).toBeHidden();
    await expect(page.getByText('O plano se ajusta toda semana ao que você estudou.')).toBeVisible();

    await ajustar.click();
    await confirmacao.getByRole('button', { name: 'Ajustar' }).click();
    const resumo = page.getByRole('region', { name: 'Seu plano foi ajustado' });
    await expect(resumo).toBeVisible();
    await expect(resumo.getByRole('listitem').first()).not.toBeEmpty();
    await expect(page.getByText(/^Último ajuste em \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible();

    await ajustar.click();
    await confirmacao.getByRole('button', { name: 'Ajustar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Você ajustou há pouco' })).toBeVisible();

    const [visto] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/ajustes\//.test(r.url())),
      resumo.getByRole('button', { name: 'Fechar' }).click(),
    ]);
    expect(visto.status()).toBe(204);
    await expect(resumo).toBeHidden();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Ajustar agora' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Seu plano foi ajustado' })).toBeHidden();
  });
});
