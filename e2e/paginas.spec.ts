import { expect, test } from '@playwright/test';

test('endereco inexistente mostra pagina 404 em portugues', async ({ page }) => {
  const resposta = await page.goto('/pagina-que-nao-existe');
  expect(resposta?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
});
