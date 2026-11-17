import { expect, test, type Locator } from '@playwright/test';
import { abrirRegistroSemCronometro, criarPlano, registroRapido } from './ajuda';

const selecionado = (select: Locator) => select.locator('option:checked');

/** Registros avulsos no Início ("Registrar sem cronômetro") e as revisões que eles criam. */
test.describe('estudo', () => {
  test.describe.configure({ timeout: 120_000 });

  test('registro manual salva', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await abrirRegistroSemCronometro(page);

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

    // O registro avulso não mexe na fila.
    await expect(page.getByRole('region', { name: 'Próximo bloco' })).toContainText(/Bloco 1 de \d+/);
  });

  test('registro rápido lembra a última matéria', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await registroRapido(page, { materia: 'Raciocínio Lógico', topico: 'Sequências', minutos: '30' });
    await page.reload();
    await abrirRegistroSemCronometro(page);
    const rapido = page.getByRole('region', { name: 'Registro rápido' });
    await expect(selecionado(rapido.getByLabel('Matéria'))).toHaveText('Raciocínio Lógico');
    await expect(selecionado(rapido.getByLabel('Tópico'))).toHaveText('Sequências');
  });

  test('registro cria revisões na agenda', async ({ page }) => {
    await criarPlano(page, { prefixo: 'estudo' });
    await page.goto('/app/revisoes');
    await expect(page.getByText('Nenhuma revisão agendada.')).toBeVisible();

    await page.goto('/app/plano');
    await registroRapido(page, { materia: 'Raciocínio Lógico', topico: 'Sequências', minutos: '45' });

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
    await page.goto('/app/plano');
    await registroRapido(page, { materia: 'Raciocínio Lógico', topico: 'Sequências', minutos: '45' });
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
