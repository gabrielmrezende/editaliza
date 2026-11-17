import { expect, test } from '@playwright/test';
import { criarPlano } from './ajuda';

test.describe('conteúdos', () => {
  test.describe.configure({ timeout: 120_000 });

  test('marcar tópico sobe o progresso e sobrevive a recarregar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'conteudos' });
    await page.goto('/app/conteudos');
    await expect(page.getByRole('heading', { level: 1, name: 'Conteúdos' })).toBeVisible();

    const materia = page.getByRole('region', { name: 'Língua Portuguesa' });
    await expect(materia.getByText(/^0 de \d+ tópicos$/)).toBeVisible();
    await expect(page.getByText(/^0% do edital · 0 de \d+ tópicos$/)).toBeVisible();

    const primeiro = materia.getByRole('checkbox').first();
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/topicos/')),
      primeiro.check(),
    ]);
    expect(resposta.status()).toBe(204);
    await expect(materia.getByText(/^1 de \d+ tópicos$/)).toBeVisible();

    await page.reload();
    await expect(materia.getByRole('checkbox').first()).toBeChecked();
    await expect(materia.getByText(/^1 de \d+ tópicos$/)).toBeVisible();
  });

  test('tópico concluído em Conteúdos aparece no Início', async ({ page }) => {
    await criarPlano(page, { prefixo: 'conteudos' });
    const cartao = page.getByRole('region', { name: 'Próximo bloco' });
    const topico = (await cartao.getByRole('heading', { level: 3 }).textContent())!.trim();

    await page.getByRole('link', { name: 'Conteúdos' }).first().click();
    await expect(page).toHaveURL(/\/app\/conteudos$/);
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/topicos/')),
      page.getByRole('checkbox', { name: topico, exact: true }).check(),
    ]);
    expect(resposta.status()).toBe(204);

    await page.getByRole('link', { name: 'Início', exact: true }).first().click();
    await expect(page).toHaveURL(/\/app\/plano$/);
    await expect(cartao.getByText('Tópico já concluído')).toBeVisible();
  });
});
