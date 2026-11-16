import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { entrar } from './ajuda';

const PDF = path.join(__dirname, '..', 'tests', 'fixtures', 'edital-exemplo.pdf');

/** Data (aaaa-mm-dd) em São Paulo daqui a `dias` dias. */
function dataDaquiA(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

/** Login → envio do PDF → Cargo A → tela de revisão. */
async function ateRevisao(page: Page) {
  await entrar(page, `onboarding-${randomUUID()}@teste.local`);
  await expect(page).toHaveURL(/\/app\/novo$/);
  await page.getByLabel('PDF do edital').setInputFiles(PDF);
  await page.getByRole('button', { name: 'Ler edital' }).click();
  await page.getByRole('button', { name: 'Cargo A' }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Confira o conteúdo' })).toBeVisible({ timeout: 30_000 });
}

async function continuar(page: Page) {
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test.describe('onboarding', () => {
  test.describe.configure({ timeout: 120_000 });

  test('do PDF ao plano', async ({ page }) => {
    await ateRevisao(page);
    await page.getByRole('button', { name: 'Remover tópico Ortografia oficial' }).click();
    await expect(page.getByRole('button', { name: 'Remover tópico Ortografia oficial' })).toHaveCount(0);
    await continuar(page);

    await expect(page.getByRole('heading', { name: 'Quando é a prova?' })).toBeVisible();
    await page.getByLabel('Data da prova').fill(dataDaquiA(90));
    await continuar(page);

    await expect(page.getByRole('heading', { name: 'Quanto tempo você tem?' })).toBeVisible();
    await expect(page.getByLabel('Segunda')).toHaveValue('2');
    await expect(page.getByLabel('Sábado')).toHaveValue('4');
    await expect(page.getByLabel('Domingo')).toHaveValue('0');
    await continuar(page);

    await expect(page.getByRole('heading', { name: 'Qual é o seu nível?' })).toBeVisible();
    await page.getByRole('group', { name: 'Raciocínio Lógico' }).getByText('Nunca vi').click();
    await page.getByRole('button', { name: 'Gerar meu plano' }).click();

    await page.waitForURL(/\/app\/plano$/);
    await expect(page.getByRole('heading', { name: 'Hoje' })).toBeVisible();
    const hoje = page.getByRole('region', { name: 'Hoje' });
    await expect(hoje.getByRole('listitem').first().or(hoje.getByText('Dia livre'))).toBeVisible();
    await expect(page.getByRole('region', { name: 'Progresso' }).getByText('0%', { exact: true })).toBeVisible();
    await expect(page.getByText('Ortografia oficial')).toHaveCount(0);

    // Marcar um tópico grava no servidor e o progresso sobe (sem bloco hoje, ex. domingo, não há o que marcar).
    const caixa = hoje.getByLabel('Concluí este tópico').first();
    if ((await caixa.count()) === 0) return;
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/planos/')),
      caixa.check(),
    ]);
    expect(resposta.status()).toBe(204);
    await page.reload();
    await expect(hoje.getByLabel('Concluí este tópico').first()).toBeChecked();
    await expect(page.getByRole('region', { name: 'Progresso' }).getByText('0%', { exact: true })).toHaveCount(0);

    const urlPlano = resposta.url().replace(/\/topicos\/.*$/, '');
    expect((await page.request.put(`${urlPlano}/topicos/nao-existe`)).status()).toBe(400);
    expect((await page.request.put('/api/planos/00000000-0000-4000-8000-000000000000/topicos/d0-t0')).status()).toBe(404);
  });

  test('data da prova no passado mostra erro e nao avanca', async ({ page }) => {
    await ateRevisao(page);
    await continuar(page);
    await page.getByLabel('Data da prova').fill(dataDaquiA(-1));
    await continuar(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('A data da prova precisa ser depois de hoje.');
    await expect(page.getByRole('heading', { name: 'Quando é a prova?' })).toBeVisible();
    await page.getByLabel('Data da prova').fill(dataDaquiA(0));
    await continuar(page);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('A data da prova precisa ser depois de hoje.');
    await expect(page.getByRole('heading', { name: 'Quando é a prova?' })).toBeVisible();
  });

  test('todas as horas zeradas nao deixa avancar', async ({ page }) => {
    await ateRevisao(page);
    await continuar(page);
    await page.getByLabel('A data ainda não saiu').check();
    await continuar(page);
    for (const dia of ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']) {
      await page.getByLabel(dia).fill('0');
    }
    await continuar(page);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Informe ao menos');
    await expect(page.getByRole('heading', { name: 'Quanto tempo você tem?' })).toBeVisible();
    await page.getByLabel('Quarta').fill('1,5');
    await continuar(page);
    await expect(page.getByRole('heading', { name: 'Qual é o seu nível?' })).toBeVisible();
  });
});
