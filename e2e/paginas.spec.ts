import { expect, test } from '@playwright/test';

for (const rota of ['estudar', 'revisoes', 'historico', 'relatorio', 'conteudos']) {
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

test.describe('tema', () => {
  test('tema escuro persiste ao recarregar', async ({ page }) => {
    await page.goto('/entrar');
    await page.getByRole('button', { name: 'Usar tema escuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('button', { name: 'Usar tema claro' })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('editaliza:tema'))).toBe('dark');
  });

  test('escolha salva vence a preferência do sistema', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('editaliza:tema', 'light'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/entrar');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test.describe('sistema em modo escuro, sem escolha salva', () => {
    test.use({ colorScheme: 'dark' });

    test('começa escuro na primeira pintura, sem aviso de hidratação', async ({ page }) => {
      const problemas: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problemas.push(m.text());
      });
      page.on('pageerror', (e) => problemas.push(e.message));

      for (const rota of ['/', '/entrar']) {
        await page.goto(rota, { waitUntil: 'domcontentloaded' });
        // Lido logo após o carregamento do documento: o script de pré-pintura já deve ter aplicado o tema.
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.getByRole('button', { name: 'Usar tema claro' })).toBeVisible();
        await page.waitForLoadState('networkidle');
      }
      expect(problemas.filter((p) => /hydrat|did not match|server rendered/i.test(p))).toEqual([]);
    });
  });
});
