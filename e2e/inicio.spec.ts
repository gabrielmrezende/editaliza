import { expect, test, type Page } from '@playwright/test';
import { criarPlano, dataDaquiA } from './ajuda';

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

/** '2026-11-18' → '18 de novembro' (como o rótulo do dia no calendário). */
const diaPorExtenso = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const calendario = (page: Page) => page.getByRole('region', { name: 'Calendário', exact: true });
const botaoDoDia = (page: Page, iso: string, depois = '') =>
  calendario(page).getByRole('button', { name: new RegExp(`^${diaPorExtenso(iso)}:${depois}`) });

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

  test('passo de concluir pelo teclado não perde o foco', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    const gatilho = cartao(page).getByRole('button', { name: 'Concluir bloco' });
    await gatilho.focus();
    await page.keyboard.press('Enter');
    const minutos = cartao(page).getByRole('textbox', { name: 'Minutos' });
    await expect(minutos).toBeFocused();

    await cartao(page).getByRole('button', { name: 'Cancelar' }).focus();
    await page.keyboard.press('Enter');
    await expect(minutos).toBeHidden();
    await expect(gatilho).toBeFocused();

    // Salvar sem concluir: depois que a tela atualiza, o foco volta para o "Concluir bloco".
    await page.keyboard.press('Enter');
    await expect(minutos).toBeFocused();
    await cartao(page).getByRole('button', { name: 'Salvar sem concluir' }).focus();
    await page.keyboard.press('Enter');
    await expect(cartao(page).getByRole('status')).toHaveText('Sessão salva.');
    await expect(gatilho).toBeEnabled();
    await expect(gatilho).toBeFocused();

    // Concluir (Enter no formulário): o foco vai para o tópico do bloco seguinte.
    await page.keyboard.press('Enter');
    await expect(minutos).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(cartao(page)).toContainText(/Bloco 2 de/);
    await expect(topicoDoCartao(page)).toBeFocused();
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

  test('calendário mostra revisões no dia certo', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    const topico = (await topicoDoCartao(page).textContent())!.trim();
    await concluir(page);
    await expect(cartao(page)).toContainText(/Bloco 2 de/);

    const hoje = dataDaquiA(0);
    await expect(botaoDoDia(page, hoje, '.*estudados')).toBeVisible();

    let mes = hoje.slice(0, 7);
    for (const dias of [1, 7]) {
      const data = dataDaquiA(dias);
      if (data.slice(0, 7) !== mes) {
        await calendario(page).getByRole('link', { name: 'Próximo mês' }).click();
        mes = data.slice(0, 7);
        await expect(page).toHaveURL(new RegExp(`mes=${mes}`));
      }
      const dia = botaoDoDia(page, data, '.*1 revisão pendente');
      await expect(dia).toBeVisible();
      await dia.click();
      await expect(dia).toHaveAttribute('aria-pressed', 'true');
      const revisoes = calendario(page).getByRole('region', { name: 'Revisões', exact: true });
      await expect(revisoes).toContainText(topico);
    }
  });

  test('/app/plano?iniciar=1 inicia o cronômetro', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await page.goto('/app/plano?iniciar=1');
    await expect(cartao(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/plano$/);
  });
});
