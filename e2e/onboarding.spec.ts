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
    await expect(page.getByRole('region', { name: 'Próximo bloco' })).toContainText(/Bloco 1 de \d+/);
    const progresso = page.getByRole('region', { name: 'Meu progresso' });
    await expect(progresso.getByText('0%', { exact: true })).toBeVisible();
    await expect(page.getByText('Ortografia oficial')).toHaveCount(0);

    // Marcar um tópico em Conteúdos grava no servidor e o progresso do Início sobe.
    await page.goto('/app/conteudos');
    const caixa = page.getByRole('region', { name: 'Língua Portuguesa' }).getByRole('checkbox').first();
    const [resposta] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/api/planos/')),
      caixa.check(),
    ]);
    expect(resposta.status()).toBe(204);
    await page.goto('/app/plano');
    await expect(progresso.getByText(/^\d+%$/)).toBeVisible();
    await expect(progresso.getByText('0%', { exact: true })).toHaveCount(0);

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

  test('ciclo: o tópico do bloco fica até concluir o tópico', async ({ page }) => {
    test.setTimeout(240_000);
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

    const cartao = page.getByRole('region', { name: 'Próximo bloco' });
    const topicoDoCartao = cartao.getByRole('heading', { level: 3 });
    const rotulo = async () => /Bloco \d+ · volta \d+/.exec((await cartao.textContent()) ?? '')?.[0] ?? '';
    /** Conclui blocos até o cartão mostrar `alvo` (o mesmo item do ciclo na volta seguinte). */
    async function concluirAte(alvo: string, marcarPrimeiro = false) {
      for (let i = 0; i < 40 && (await rotulo()) !== alvo; i++) {
        const antes = await rotulo();
        await cartao.getByRole('button', { name: 'Concluir bloco' }).click();
        const passo = cartao.getByRole('form', { name: 'Concluir o bloco' });
        if (marcarPrimeiro && i === 0) await passo.getByLabel('Concluí este tópico').check();
        await passo.getByRole('button', { name: 'Concluir bloco' }).click();
        await expect.poll(rotulo).not.toBe(antes);
      }
      await expect(cartao).toContainText(alvo);
    }

    await expect(cartao).toContainText('Bloco 1 · volta 1');
    const topico = (await topicoDoCartao.textContent())!.trim();

    // Concluir sem "Concluí este tópico": quando a matéria volta, o tópico é o mesmo.
    await concluirAte('Bloco 1 · volta 2');
    await expect(topicoDoCartao).toHaveText(topico);

    // Com a caixa marcada: na volta seguinte vem o próximo tópico da matéria.
    await concluirAte('Bloco 1 · volta 3', true);
    await expect(topicoDoCartao).not.toHaveText(topico);
    const seguinte = (await topicoDoCartao.textContent())!.trim();

    // Recarregar mantém a posição e o tópico.
    await page.reload();
    await expect(cartao).toContainText('Bloco 1 · volta 3');
    await expect(topicoDoCartao).toHaveText(seguinte);
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
