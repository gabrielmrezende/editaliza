import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ateRevisao, continuar, dataDaquiA, entrar } from './ajuda';

const PDF = path.join(__dirname, '..', 'tests', 'fixtures', 'edital-exemplo.pdf');

test.describe('onboarding', () => {
  test.describe.configure({ timeout: 120_000 });

  test('do PDF ao plano', async ({ page }) => {
    await ateRevisao(page);
    await page.getByRole('button', { name: 'Remover tópico Ortografia oficial' }).click();
    await expect(page.getByRole('button', { name: 'Remover tópico Ortografia oficial' })).toHaveCount(0);

    // Adicionar tópico foca o campo novo uma vez; depois o foco não é roubado ao digitar em outro campo.
    await page.getByRole('region', { name: 'Matéria Língua Portuguesa' }).getByRole('button', { name: 'Adicionar tópico' }).click();
    const novo = page.getByLabel('Tópico 4 de Língua Portuguesa');
    await expect(novo).toBeFocused();
    const outro = page.getByLabel('Tópico 1 de Raciocínio Lógico');
    await outro.click();
    await outro.press('ControlOrMeta+a');
    await outro.pressSequentially('Lógica proposicional');
    await expect(outro).toHaveValue('Lógica proposicional');
    await expect(outro).toBeFocused();
    await novo.fill('Redação oficial');
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

  test('ciclo: topico de hoje fica fixo e pode ser desmarcado', async ({ page }) => {
    await ateRevisao(page);
    await continuar(page);
    await page.getByLabel('A data ainda não saiu').check();
    await continuar(page);
    for (const dia of ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']) {
      await page.getByLabel(dia).fill('1');
    }
    await continuar(page);
    await page.getByRole('button', { name: 'Gerar meu plano' }).click();
    await page.waitForURL(/\/app\/plano$/);

    const hoje = page.getByRole('region', { name: 'Hoje' });
    // Hoje mostra exatamente o tempo do dia (1 h), não a cota semanal da matéria.
    await expect(hoje.getByText(/, 1 h de estudo$/)).toBeVisible();
    // A semana segue o ciclo: 7 dias, cada um com 1 h.
    const dias = page.getByRole('region', { name: 'Semana' }).locator('ol').first().locator(':scope > li');
    await expect(dias).toHaveCount(7);
    for (let i = 0; i < 7; i++) await expect(dias.nth(i)).toHaveText(/1 h$/);
    const caixa = hoje.getByLabel('Concluí este tópico');
    await expect(caixa).toHaveCount(1);
    const nomeTopico = hoje.getByRole('listitem').locator('p').nth(1);
    const topico = await nomeTopico.textContent();
    const status = page.getByRole('main').getByRole('status');
    const gravou = (metodo: string) =>
      page.waitForResponse((r) => r.request().method() === metodo && r.url().includes('/api/planos/'));

    // Marca: continua no mesmo tópico (não pula para o próximo) e é anunciado.
    await Promise.all([gravou('PUT'), caixa.check()]);
    await expect(caixa).toBeChecked();
    await expect(nomeTopico).toHaveText(topico!);
    await expect(status).toContainText('marcado como concluído');

    // Recarregando, o tópico de hoje segue fixo e marcado; dá para desmarcar.
    await page.reload();
    await expect(caixa).toBeChecked();
    await expect(nomeTopico).toHaveText(topico!);
    await Promise.all([gravou('DELETE'), caixa.uncheck()]);
    await expect(caixa).not.toBeChecked();
    await expect(status).toContainText('desmarcado');

    // Cliques rápidos: o servidor termina com o último estado escolhido.
    await caixa.click();
    await caixa.click();
    await caixa.click();
    await expect(caixa).toBeChecked();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(caixa).toBeChecked();
    await expect(nomeTopico).toHaveText(topico!);
  });

  test('sem conexao durante a leitura avisa e permite tentar de novo', async ({ page }) => {
    await entrar(page, `conexao-${randomUUID()}@teste.local`);
    // Só as consultas (GET /api/editais/:id) falham; o envio passa.
    await page.route('**/api/editais/*', (route) =>
      route.request().method() === 'GET' ? route.abort('internetdisconnected') : route.fallback(),
    );
    await page.getByLabel('PDF do edital').setInputFiles(PDF);
    await page.getByRole('button', { name: 'Ler edital' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Não conseguimos falar com o servidor', {
      timeout: 20_000,
    });
    await page.unroute('**/api/editais/*');
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByRole('button', { name: 'Cargo A' })).toBeVisible({ timeout: 30_000 });
  });
});
