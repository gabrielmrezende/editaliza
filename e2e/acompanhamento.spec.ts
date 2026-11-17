import { expect, test, type Page } from '@playwright/test';
import { criarPlano } from './ajuda';

const hoje = (page: Page) => page.getByRole('region', { name: 'Hoje' });
const primeiroBloco = (page: Page) => hoje(page).getByRole('listitem').first();

/** Clica em "Estudei" no 1º bloco de Hoje e espera a gravação (201). */
async function estudeiNoPrimeiroBloco(page: Page): Promise<void> {
  const [resposta] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/sessoes')),
    primeiroBloco(page).getByRole('button', { name: 'Estudei' }).click(),
  ]);
  expect(resposta.status()).toBe(201);
  await expect(primeiroBloco(page).getByText('Registrado')).toBeVisible();
}

test.describe('acompanhamento', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Estudei registra e desfaz', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento', horasDomingo: '2' });
    const bloco = primeiroBloco(page);
    await expect(bloco.getByRole('link', { name: 'Iniciar' })).toHaveAttribute(
      'href',
      /^\/app\/estudar\?disciplina=[^&]+&topico=[^&]+&iniciar=1$/,
    );

    await estudeiNoPrimeiroBloco(page);
    await page.reload();
    await expect(primeiroBloco(page).getByText('Registrado')).toBeVisible();

    await primeiroBloco(page).getByRole('button', { name: 'Desfazer' }).click();
    await expect(primeiroBloco(page).getByRole('button', { name: 'Estudei' })).toBeVisible();
    await page.reload();
    await expect(primeiroBloco(page).getByRole('button', { name: 'Estudei' })).toBeVisible();
  });

  test('Iniciar do mesmo estudo retoma o cronômetro parado', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento', horasDomingo: '2' });
    const secoes = page.getByRole('navigation', { name: 'Seções' });
    const cronometro = page.getByRole('region', { name: 'Cronômetro' });

    await primeiroBloco(page).getByRole('link', { name: 'Iniciar' }).click();
    await expect(cronometro.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await cronometro.getByRole('button', { name: 'Parar' }).click();
    await expect(cronometro.getByText('Menos de 1 minuto marcado.')).toBeVisible();

    // Volta a Hoje e pede o mesmo estudo: o formulário de parada sai e o cronômetro volta a rodar.
    await secoes.getByRole('link', { name: 'Plano' }).click();
    await primeiroBloco(page).getByRole('link', { name: 'Iniciar' }).click();
    await expect(page).toHaveURL(/\/app\/estudar$/);
    await expect(cronometro.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(cronometro.getByText('Menos de 1 minuto marcado.')).toBeHidden();
  });

  test('histórico edita e exclui', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento', horasDomingo: '2' });
    await page.goto('/app/historico');
    await expect(page.getByText('Nenhuma sessão registrada ainda.')).toBeVisible();

    await page.goto('/app/plano');
    await estudeiNoPrimeiroBloco(page);
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
    await expect(confirmacao).toContainText('As revisões pendentes criadas por ela também serão apagadas.');
    await confirmacao.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Nenhuma sessão registrada ainda.')).toBeVisible();
  });

  test('relatório mostra o tempo, o acerto e o assunto a reforçar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'acompanhamento', horasDomingo: '2' });
    await page.goto('/app/relatorio');
    await expect(page.getByText('Nenhum estudo registrado neste período.')).toBeVisible();

    await page.goto('/app/estudar');
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
    await ajustar.click();
    const resumo = page.getByRole('region', { name: 'Seu plano foi ajustado' });
    await expect(resumo).toBeVisible();
    await expect(resumo.getByRole('listitem').first()).not.toBeEmpty();
    await expect(page.getByText(/^Último ajuste em \d{2}\/\d{2}\/\d{4}\.$/)).toBeVisible();

    await ajustar.click();
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
