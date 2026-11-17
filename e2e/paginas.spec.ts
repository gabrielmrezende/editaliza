import { expect, test } from '@playwright/test';

for (const rota of ['estudar', 'revisoes', 'historico', 'relatorio']) {
  test(`/app/${rota} sem login redireciona para /entrar`, async ({ page }) => {
    await page.goto(`/app/${rota}`);
    await expect(page).toHaveURL(/\/entrar/);
  });
}

test('endereco inexistente mostra pagina 404 em portugues', async ({ page }) => {
  const resposta = await page.goto('/pagina-que-nao-existe');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
});
