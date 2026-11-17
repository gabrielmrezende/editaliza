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
    await expect(cartao(outra).getByRole('alert')).toContainText('Sua fila mudou (em outra tela ou por um ajuste)');
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

  test('Estudar redireciona para o Início e inicia o cronômetro', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await page.goto('/app/estudar?disciplina=d0&topico=d0-t0&iniciar=1');
    await expect(page).toHaveURL(/\/app\/plano$/);
    await expect(cartao(page).getByRole('button', { name: 'Pausar' })).toBeVisible();
    const secoes = page.getByRole('navigation', { name: 'Seções' }).first();
    await expect(secoes.getByRole('link', { name: 'Estudar' })).toHaveCount(0);
    await expect(secoes.getByRole('link', { name: 'Início' })).toHaveAttribute('aria-current', 'page');
  });

  test('no celular a grade mostra 4 blocos e "Ver mais blocos" abre o resto', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    await page.setViewportSize({ width: 390, height: 844 });
    const visiveis = grade(page).filter({ visible: true });
    await expect(visiveis).toHaveCount(4);
    // O número de cada bloco é o primeiro texto da linha de cima.
    const numeros = () => visiveis.evaluateAll((lis) => lis.map((li) => li.querySelector('p > span')?.textContent?.trim()));
    expect(await numeros()).toEqual(['2', '3', '4', '5']);

    const botao = page.getByRole('button', { name: 'Ver mais blocos' });
    await expect(botao).toHaveAttribute('aria-expanded', 'false');
    await botao.click();
    await expect(visiveis).toHaveCount(12);
    expect((await numeros()).slice(0, 5)).toEqual(['2', '3', '4', '5', '6']);
    await page.getByRole('button', { name: 'Ver menos' }).click();
    await expect(visiveis).toHaveCount(4);

    // No computador a grade mostra todos e o botão não aparece.
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(visiveis).toHaveCount(12);
    await expect(page.getByRole('button', { name: 'Ver mais blocos' })).toBeHidden();
  });

  test('Zerar descarta o tempo do cronômetro pausado (com confirmação)', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    const zerar = cartao(page).getByRole('button', { name: 'Zerar' });
    const iniciar = cartao(page).getByRole('button', { name: 'Iniciar' });
    await expect(zerar).toBeHidden();
    await iniciar.click();
    await expect.poll(async () => emSegundos(await relogio(page).textContent())).toBeGreaterThanOrEqual(1);
    await expect(zerar).toBeHidden(); // rodando: só "Pausar"
    await cartao(page).getByRole('button', { name: 'Pausar' }).click();

    const dialogo = page.getByRole('dialog', { name: 'Descartar o tempo?' });
    await zerar.click();
    await expect(dialogo).toContainText('O tempo marcado no cronômetro será perdido.');
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(relogio(page)).not.toHaveText('00:00:00');

    await zerar.click();
    await dialogo.getByRole('button', { name: 'Descartar' }).click();
    await expect(relogio(page)).toHaveText('00:00:00');
    await expect(iniciar).toBeVisible();
    await expect(iniciar).toBeFocused();
    await expect(zerar).toBeHidden();

    await page.reload();
    await expect(relogio(page)).toHaveText('00:00:00');
    await expect(iniciar).toBeVisible();
  });

  test('prazo: "Concluí este tópico" vem marcado só no último bloco do tópico', async ({ page }) => {
    test.setTimeout(240_000);
    await criarPlano(page, { prefixo: 'inicio' });
    const caixa = cartao(page).getByRole('checkbox', { name: 'Concluí este tópico' });
    const numero = async () => Number(/Bloco (\d+) de/.exec((await cartao(page).textContent()) ?? '')?.[1]);
    const desmarcados = new Set<string>();
    let marcado: string | null = null;
    for (let i = 0; i < 40 && marcado === null; i++) {
      const topico = (await topicoDoCartao(page).textContent())!.trim();
      const seguintes = (await grade(page).locator('[data-topico]').allTextContents()).map((t) => t.trim());
      if (seguintes.includes(topico)) {
        // O tópico ainda volta na fila: a caixa vem desmarcada.
        await expect(caixa).not.toBeChecked();
        desmarcados.add(topico);
      } else if (await caixa.isChecked()) {
        marcado = topico;
        break;
      }
      const antes = await numero();
      await concluir(page);
      await expect.poll(numero).toBe(antes + 1);
    }
    // O último bloco de um tópico que já apareceu desmarcado antes vem marcado (e dá para desmarcar).
    expect(marcado).not.toBeNull();
    expect([...desmarcados]).toContain(marcado);
    await caixa.uncheck();
    await expect(caixa).not.toBeChecked();
    await cartao(page).getByRole('button', { name: 'Concluir bloco' }).click();
    await expect(cartao(page).getByRole('form', { name: 'Concluir o bloco' }).getByRole('checkbox')).not.toBeChecked();
  });

  test('capturas do Início', async ({ page }) => {
    await criarPlano(page, { prefixo: 'inicio' });
    // Sem as animações de entrada: a captura sai com tudo no lugar.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const tema of ['light', 'dark'] as const) {
      await page.evaluate((t) => localStorage.setItem('editaliza:tema', t), tema);
      for (const [largura, altura] of [
        [1280, 900],
        [375, 812],
      ] as const) {
        await page.setViewportSize({ width: largura, height: altura });
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        await expect(cartao(page)).toContainText(/Bloco 1 de \d+/);
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `test-results/capturas/inicio-${tema}-${largura}.png`, fullPage: true });
      }
    }
  });
});
