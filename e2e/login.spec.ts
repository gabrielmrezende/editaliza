import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { entrar } from './ajuda';

test('visitante em /app vai para /entrar', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

test('login por link mágico leva a /app/novo (sem plano ativo)', async ({ page }) => {
  await entrar(page, `login-${randomUUID()}@teste.local`);
  await expect(page).toHaveURL(/\/app\/novo$/);
});
