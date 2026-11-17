import { expect, test, type Page } from '@playwright/test';
import { criarPlano } from './ajuda';

/** "01:02:03" → 3723. */
function emSegundos(texto: string | null): number {
  const [h, m, s] = (texto ?? '').trim().split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

const cartao = (page: Page) => page.getByRole('region', { name: 'Próximo bloco' });
const relogio = (page: Page) => cartao(page).getByRole('timer');
const grade = (page: Page) => page.getByRole('list', { name: 'Próximos blocos' }).getByRole('listitem');
const topicoDoCartao = (page: Page) => cartao(page).getByRole('heading', { level: 3 });

/** Abre o passo curto e conclui (ou só salva) com os minutos já preenchidos. */
async function concluir(page: Page, botao: 'Concluir bloco' | 'Salvar sem concluir' = 'Concluir bloco') {
  await cartao(page).getByRole('button', { name: 'Concluir bloco' }).click();
  await expect(cartao(page).getByRole('textbox', { name: 'Minutos' })).toHaveValue(/^\d+$/);
  await cartao(page).getByRole('button', { name: botao }).click();
}

async function sessoesNoHistorico(page: Page) {
  await page.goto('/app/historico');
  return page.getByRole('list', { name: 'Sessões' }).getByRole('listitem');
}

test.describe('início', () => {
  test.describe.configure({ timeout: 120_000 });

  test('concluir bloco avança e sobrevive a recarregar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await expect(cartao(page)).toContainText(/Bloco 1 de \d+/);
    const proximo = (await grade(page).first().locator('[data-topico]').textContent())!.trim();

    await concluir(page);
    await expect(cartao(page).getByRole('status')).toHaveText('Bloco concluído.');
    await expect(cartao(page)).toContainText(/Bloco 2 de \d+/);
    await expect(topicoDoCartao(page)).toHaveText(proximo);

    await page.reload();
    await expect(cartao(page)).toContainText(/Bloco 2 de \d+/);
  });

  test('voltar um bloco recua sem apagar a sessão', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await expect(cartao(page).getByRole('button', { name: 'Voltar um bloco' })).toBeDisabled();
    await concluir(page);
    await expect(cartao(page)).toContainText(/Bloco 2 de/);
    await cartao(page).getByRole('button', { name: 'Voltar um bloco' }).click();
    await expect(cartao(page)).toContainText(/Bloco 1 de/);
    await page.reload();
    await expect(cartao(page)).toContainText(/Bloco 1 de/);
    await expect(await sessoesNoHistorico(page)).toHaveCount(1);
  });

  test('salvar sem concluir não avança', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await concluir(page, 'Salvar sem concluir');
    await expect(cartao(page).getByRole('status')).toHaveText('Sessão salva.');
    await expect(cartao(page)).toContainText(/Bloco 1 de/);
    await page.reload();
    await expect(cartao(page)).toContainText(/Bloco 1 de/);
    await expect(await sessoesNoHistorico(page)).toHaveCount(1);
  });

  test('cronômetro no Início sobrevive a recarregar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await cartao(page).getByRole('button', { name: 'Iniciar' }).click();
    await page.waitForTimeout(2_000);
    await page.reload();
    await expect.poll(async () => emSegundos(await relogio(page).textContent())).toBeGreaterThanOrEqual(2);
    await expect(cartao(page).getByRole('button', { name: 'Pausar' })).toBeVisible();

    await cartao(page).getByRole('button', { name: 'Pausar' }).click();
    const pausado = await relogio(page).textContent();
    await page.reload();
    await expect(cartao(page).getByRole('button', { name: 'Retomar' })).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(relogio(page)).toHaveText(pausado!);
  });

  test('ciclo mostra a volta', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio', dataProva: null });
    await expect(cartao(page)).toContainText('Bloco 1 · volta 1');
    await concluir(page);
    await expect(cartao(page)).toContainText('Bloco 2 · volta 1');
  });

  test('fila mudou em outra aba: avisa, atualiza e mantém o cronômetro', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    const outra = await page.context().newPage();
    await outra.goto('/app/plano');
    await expect(cartao(outra)).toContainText(/Bloco 1 de/);
    await cartao(outra).getByRole('button', { name: 'Iniciar' }).click();
    await expect(cartao(outra).getByRole('button', { name: 'Pausar' })).toBeVisible();

    await page.reload();
    await concluir(page);
    await expect(cartao(page)).toContainText(/Bloco 2 de/);

    await concluir(outra);
    await expect(cartao(outra).getByRole('alert')).toContainText('A fila mudou em outra tela');
    await expect(cartao(outra)).toContainText(/Bloco 2 de/);
    const antes = emSegundos(await relogio(outra).textContent());
    await expect.poll(async () => emSegundos(await relogio(outra).textContent())).toBeGreaterThan(antes);
    await expect(cartao(outra).getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(await sessoesNoHistorico(page)).toHaveCount(1);
  });

  test('/app/plano?iniciar=1 inicia o cronômetro', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await page.goto('/app/plano?iniciar=1');
    await expect(cartao(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/plano$/);
  });
});
