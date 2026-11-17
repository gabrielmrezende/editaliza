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
});
