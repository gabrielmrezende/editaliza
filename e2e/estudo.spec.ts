import { expect, test, type Locator, type Page } from '@playwright/test';
import { criarPlano } from './ajuda';

/** "01:02:03" → 3723. */
function emSegundos(texto: string | null): number {
  const [h, m, s] = (texto ?? '').trim().split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

const cronometro = (page: Page) => page.getByRole('region', { name: 'Cronômetro' });
const relogio = (page: Page) => cronometro(page).getByRole('timer');
const selecionado = (select: Locator) => select.locator('option:checked');

test.describe('estudo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('cronômetro sobrevive a recarregar', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.goto('/app/estudar');
    const regiao = cronometro(page);
    await regiao.getByLabel('Matéria').selectOption({ label: 'Raciocínio Lógico' });
    await regiao.getByLabel('Tópico').selectOption({ label: 'Diagramas lógicos' });
    await regiao.getByRole('button', { name: 'Iniciar' }).click();
    await expect(page).toHaveTitle(/^00:00:0\d · Editaliza$/);
    await page.waitForTimeout(2_000);

    await page.reload();
    await expect.poll(async () => emSegundos(await relogio(page).textContent())).toBeGreaterThanOrEqual(2);
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Raciocínio Lógico');
    await expect(selecionado(regiao.getByLabel('Tópico'))).toHaveText('Diagramas lógicos');
    await expect(regiao.getByRole('status')).toContainText('Recuperamos o cronômetro');

    await regiao.getByRole('button', { name: 'Pausar' }).click();
    const pausado = await relogio(page).textContent();
    await page.reload();
    await expect(regiao.getByRole('button', { name: 'Continuar' })).toBeVisible();
    await page.waitForTimeout(1_500);
    await expect(relogio(page)).toHaveText(pausado!);
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Raciocínio Lógico');

    // Descartar pede confirmação em um diálogo e zera o cronômetro.
    await regiao.getByRole('button', { name: 'Descartar' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Descartar o tempo?' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Descartar' }).click();
    await expect(dialogo).toBeHidden();
    await expect(relogio(page)).toHaveText('00:00:00');
    await page.reload();
    await expect(relogio(page)).toHaveText('00:00:00');
    await expect(regiao.getByRole('button', { name: 'Iniciar' })).toBeVisible();
  });

  test('registro manual salva', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.clock.install();
    await page.goto('/app/estudar');

    const manual = page.getByRole('region', { name: 'Registrar sessão' });
    await manual.getByLabel('Matéria').selectOption({ label: 'Língua Portuguesa' });
    await manual.getByLabel('Tópico').selectOption({ label: 'Pontuação' });
    await expect(manual.getByLabel('Em 7 dias')).toBeChecked();
    await manual.getByLabel('Minutos').fill('45');
    await manual.getByLabel('Tipo').selectOption({ label: 'Questões' });
    await manual.getByLabel('Acertos').fill('8');
    await manual.getByLabel('Erros').fill('2');
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/api/sessoes')),
      manual.getByRole('button', { name: 'Salvar sessão' }).click(),
    ]);
    expect(resposta.status()).toBe(201);
    await expect(manual.getByRole('status')).toHaveText('Sessão registrada');
    await expect(manual.getByLabel('Minutos')).toHaveValue('');
    await expect(manual.getByLabel('Matéria')).toHaveValue('');
    await expect(manual.getByLabel('Acertos')).toHaveValue('');

    // Sem tempo nem questões, o formulário avisa e não envia.
    await manual.getByLabel('Matéria').selectOption({ label: 'Língua Portuguesa' });
    await manual.getByRole('button', { name: 'Salvar sessão' }).click();
    await expect(manual.getByRole('alert')).toHaveText('Informe o tempo ou as questões.');

    // Parar o cronômetro abre o formulário com os minutos preenchidos.
    const regiao = cronometro(page);
    await regiao.getByLabel('Matéria').selectOption({ label: 'Direito Administrativo' });
    await regiao.getByRole('button', { name: 'Iniciar' }).click();
    await page.clock.fastForward('10:00');
    await regiao.getByRole('button', { name: 'Parar' }).click();
    await expect(regiao.getByLabel('Minutos')).toHaveValue('10');
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Direito Administrativo');

    // Esquecido ligado: aviso e minutos editáveis.
    await regiao.getByRole('button', { name: 'Continuar cronômetro' }).click();
    await page.clock.fastForward('07:00:00');
    await regiao.getByRole('button', { name: 'Parar' }).click();
    await expect(regiao.getByText('O cronômetro ficou ligado por 7h 10min. Confira o tempo antes de salvar.')).toBeVisible();
    await expect(regiao.getByLabel('Minutos')).toHaveValue('430');
    await regiao.getByLabel('Minutos').fill('90');
    await regiao.getByRole('button', { name: 'Salvar sessão' }).click();
    await expect(regiao.getByRole('status')).toHaveText('Sessão registrada');
    await expect(relogio(page)).toHaveText('00:00:00');
    await page.reload();
    await expect(relogio(page)).toHaveText('00:00:00');

    // Menos de 1 minuto: oferece descartar ou continuar.
    await regiao.getByRole('button', { name: 'Iniciar' }).click();
    await regiao.getByRole('button', { name: 'Parar' }).click();
    await expect(regiao.getByText('Menos de 1 minuto marcado.')).toBeVisible();
    await regiao.getByRole('button', { name: 'Descartar' }).click();
    await expect(relogio(page)).toHaveText('00:00:00');
  });

  test('registro rápido lembra a última matéria e o link de Hoje inicia o cronômetro', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.goto('/app/estudar');
    const rapido = page.getByRole('region', { name: 'Registro rápido' });
    await rapido.getByLabel('Matéria').selectOption({ label: 'Raciocínio Lógico' });
    await rapido.getByLabel('Tópico').selectOption({ label: 'Sequências' });
    await rapido.getByLabel('Minutos').fill('30');
    await rapido.getByRole('button', { name: 'Registrar' }).click();
    await expect(rapido.getByRole('status')).toHaveText('Sessão registrada');
    await page.reload();
    await expect(selecionado(rapido.getByLabel('Matéria'))).toHaveText('Raciocínio Lógico');
    await expect(selecionado(rapido.getByLabel('Tópico'))).toHaveText('Sequências');

    // ?iniciar=1 pré-seleciona e inicia; com outro cronômetro rodando, pergunta antes de trocar.
    await page.goto('/app/estudar?disciplina=d0&topico=d0-t2&iniciar=1');
    const regiao = cronometro(page);
    await expect(regiao.getByRole('button', { name: 'Pausar' })).toBeVisible();
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Língua Portuguesa');
    await expect(page).toHaveURL(/\/app\/estudar$/);

    await page.goto('/app/estudar?disciplina=d1&iniciar=1');
    const dialogo = page.getByRole('dialog', { name: 'Trocar de cronômetro?' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Manter o atual' }).click();
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Língua Portuguesa');

    await page.goto('/app/estudar?disciplina=d1&iniciar=1');
    await page.getByRole('dialog', { name: 'Trocar de cronômetro?' }).getByRole('button', { name: 'Trocar' }).click();
    await expect(selecionado(regiao.getByLabel('Matéria'))).toHaveText('Raciocínio Lógico');
    await expect(regiao.getByRole('button', { name: 'Pausar' })).toBeVisible();
  });
  test('registro cria revisões na agenda', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.goto('/app/revisoes');
    await expect(page.getByText('Nenhuma revisão agendada.')).toBeVisible();

    await page.goto('/app/estudar');
    const rapido = page.getByRole('region', { name: 'Registro rápido' });
    await rapido.getByLabel('Matéria').selectOption({ label: 'Raciocínio Lógico' });
    await rapido.getByLabel('Tópico').selectOption({ label: 'Sequências' });
    await rapido.getByLabel('Minutos').fill('45');
    await rapido.getByRole('button', { name: 'Registrar' }).click();
    await expect(rapido.getByRole('status')).toHaveText('Sessão registrada');

    await page.goto('/app/revisoes');
    const semana = page.getByRole('region', { name: /^Esta semana/ });
    const proximas = page.getByRole('region', { name: /^Próximas/ });
    await expect(semana.getByRole('heading', { name: 'Esta semana (2)' })).toBeVisible();
    await expect(proximas.getByRole('heading', { name: 'Próximas (2)' })).toBeVisible();
    await expect(semana.getByText('Sequências')).toHaveCount(2);
    await expect(semana.getByText(/1 dia após o estudo/)).toBeVisible();
    await expect(semana.getByText(/7 dias após o estudo/)).toBeVisible();
    await expect(proximas.getByText(/21 dias após o estudo/)).toBeVisible();
    await expect(proximas.getByText(/30 dias após o estudo/)).toBeVisible();

    // Concluir vai para "Concluídas" e continua assim depois de recarregar.
    const [patch] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/api/revisoes/')),
      semana.getByRole('checkbox', { name: 'Concluir a revisão de Sequências' }).first().click(),
    ]);
    expect(patch.status()).toBe(204);
    const concluidas = page.getByRole('region', { name: /^Concluídas/ });
    await expect(concluidas.getByRole('heading', { name: 'Concluídas (1)' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'revisão concluída' })).toBeAttached();
    await expect(semana.getByRole('heading', { name: 'Esta semana (1)' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: /^Concluídas/ }).getByRole('heading', { name: 'Concluídas (1)' })).toBeVisible();
    await expect(page.getByRole('region', { name: /^Esta semana/ }).getByRole('heading', { name: 'Esta semana (1)' })).toBeVisible();

    // Excluir pede confirmação.
    await proximas.getByRole('button', { name: 'Excluir a revisão de Sequências' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Excluir a revisão?' });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Excluir' }).click();
    await expect(proximas.getByRole('heading', { name: 'Próximas (1)' })).toBeVisible();
  });
  test('falhas ao concluir ou excluir revisão voltam ao estado anterior', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.goto('/app/estudar');
    const rapido = page.getByRole('region', { name: 'Registro rápido' });
    await rapido.getByLabel('Matéria').selectOption({ label: 'Raciocínio Lógico' });
    await rapido.getByLabel('Tópico').selectOption({ label: 'Sequências' });
    await rapido.getByLabel('Minutos').fill('45');
    await rapido.getByRole('button', { name: 'Registrar' }).click();
    await expect(rapido.getByRole('status')).toHaveText('Sessão registrada');
    await page.goto('/app/revisoes');
    const semana = page.getByRole('region', { name: /^Esta semana/ });
    const caixa = semana.getByRole('checkbox', { name: 'Concluir a revisão de Sequências' }).first();

    // PATCH recusado (409): a marcação volta e o motivo aparece.
    const msg = 'Já existe uma revisão pendente igual a esta.';
    await page.route('**/api/revisoes/*', (rota) =>
      rota.request().method() === 'PATCH'
        ? rota.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ erro: msg }) })
        : rota.continue(),
    );
    await caixa.click();
    await expect(page.locator('p[role=alert]')).toHaveText(msg);
    await expect(semana.getByRole('heading', { name: 'Esta semana (2)' })).toBeVisible();
    await expect(caixa).not.toBeChecked();

    // DELETE com erro 500: a linha volta e há aviso.
    await page.unroute('**/api/revisoes/*');
    await page.route('**/api/revisoes/*', (rota) =>
      rota.request().method() === 'DELETE'
        ? rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ erro: 'Falha no servidor.' }) })
        : rota.continue(),
    );
    await semana.getByRole('button', { name: 'Excluir a revisão de Sequências' }).first().click();
    await page.getByRole('dialog', { name: 'Excluir a revisão?' }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.locator('p[role=alert]')).toHaveText('Falha no servidor.');
    await expect(semana.getByRole('heading', { name: 'Esta semana (2)' })).toBeVisible();

    // Excluir enquanto uma marcação falha em voo: a exclusão ainda é enviada.
    await page.unroute('**/api/revisoes/*');
    await page.route('**/api/revisoes/*', async (rota) => {
      const metodo = rota.request().method();
      if (metodo === 'PATCH') {
        await new Promise((r) => setTimeout(r, 2500));
        await rota.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      } else {
        await rota.continue();
      }
    });
    await caixa.click();
    // A revisão marcada foi para "Concluídas" (otimista); é ela que se exclui enquanto a marcação está em voo.
    await page
      .getByRole('region', { name: /^Concluídas/ })
      .getByRole('button', { name: 'Excluir a revisão de Sequências' })
      .click();
    const [delecao] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'DELETE' && r.url().includes('/api/revisoes/')),
      page.getByRole('dialog', { name: 'Excluir a revisão?' }).getByRole('button', { name: 'Excluir' }).click(),
    ]);
    expect(delecao.status()).toBe(204);
    await expect(semana.getByRole('heading', { name: 'Esta semana (1)' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('region', { name: /^Esta semana/ }).getByRole('heading', { name: 'Esta semana (1)' })).toBeVisible();
  });
});
